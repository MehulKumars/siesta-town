// The town as a small 3D model: a sunlit square seen from the front and above, with the sun travelling
// over it from right (morning) to high at the back (noon) to left (evening). Nothing here decides the
// puzzle; it only shows what game.ts tells it and reports which tile the player is pointing at.
//
// The town is drawn with row 0 nearest the viewer, so noon shadows (which the rules send to the row
// before) fall towards the player, in front of each house, where they can be seen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Puzzle, TimeOfDay } from '../shared/engine/types.ts';

const FIELD_OF_VIEW = 24;
/** How steeply the camera looks down, in radians from level. */
const LOOK_DOWN = (60 * Math.PI) / 180;
const STOREY = 0.26;
/** Each nap time has its own colour, used on the cat's mat, its badge and the time buttons. */
export const NAP_COLOUR: Record<TimeOfDay, number> = { am: 0xff6f91, noon: 0xffc22e, pm: 0x7a5cf0 };
const INK = 0x1b2766;

const DAY: Record<TimeOfDay, number> = { am: 0, noon: 1, pm: 2 };
/** Sunlight, sky light and ground bounce at morning, noon and evening. */
const LIGHT = [
  { sun: 0xffe6d6, sky: 0xfff4ee, ground: 0xf0d6b4, power: 2.5 },
  { sun: 0xffffff, sky: 0xf4faff, ground: 0xf5e6c0, power: 2.3 },
  { sun: 0xffd2a0, sky: 0xf1e8ff, ground: 0xe6c2a6, power: 2.5 },
] as const;
const WALLS = [0xfffaf0, 0xffe9c9, 0xd6ebfb, 0xdff3d0, 0xfbe1ee] as const;
const FUR = [0xffffff, 0xf5a34e, 0xaab3c5, 0x43435a, 0xf3d9a4, 0xe08a5b] as const;
const PETALS = [0xff4f93, 0xff7a3d, 0xc65bd6, 0xff5368] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** A steady pseudo-random number, so the same town always looks the same. */
function grain(a: number, b: number): number {
  let n = Math.imul(a + 1, 374761393) ^ Math.imul(b + 7, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function pick<T>(list: readonly T[], index: number, fallback: T): T {
  return list[((index % list.length) + list.length) % list.length] ?? fallback;
}

/** Draws on a small canvas and hands it back as a texture, for badges and signs. */
function painted(size: number, draw: (ink: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const paper = document.createElement('canvas');
  paper.width = size;
  paper.height = size;
  const ink = paper.getContext('2d');
  if (ink) draw(ink, size);
  const texture = new THREE.CanvasTexture(paper);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type HouseView = {
  group: THREE.Group;
  paints: THREE.Material[];
  windows: THREE.MeshStandardMaterial;
  cell: number;
  height: number;
  age: number;
  fade: number;
  lifted: boolean;
};

type CatView = {
  group: THREE.Group;
  body: THREE.Mesh;
  chest: THREE.Mesh;
  paws: THREE.Mesh[];
  head: THREE.Group;
  eyes: THREE.Mesh[];
  glints: THREE.Mesh[];
  tail: THREE.Group;
  badge: THREE.Sprite;
  alarm: THREE.Sprite;
  ring: THREE.Mesh;
  mat: THREE.Mesh;
  nap: TimeOfDay;
  asleep: boolean;
  trouble: boolean;
  doze: number;
  zIn: number;
  hop: number;
};

type FlowerView = {
  group: THREE.Group;
  head: THREE.Group;
  petals: THREE.MeshStandardMaterial;
  ring: THREE.Mesh;
  colour: THREE.Color;
  lit: boolean;
  trouble: boolean;
  open: number;
  pop: number;
};

type Spark = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; age: number; size: number; r: number; g: number; b: number; gravity: number };
type Zed = { sprite: THREE.Sprite; age: number; life: number; x: number; y: number; z: number };

const MOST_SPARKS = 320;

export class TownStage {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.5, 120);
  private readonly sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
  private readonly skyLight = new THREE.HemisphereLight(0xffffff, 0xe0c090, 1.25);
  private readonly reducedMotion: boolean;
  private readonly ray = new THREE.Raycaster();
  private readonly floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05);

  private town = new THREE.Group();
  private size = 4;
  private clock = 0;
  private last = 0;
  private width = 1;
  private height = 1;

  // The time of day, as a number that glides: 0 morning, 1 noon, 2 evening.
  private day = 0;
  private dayFrom = 0;
  private dayTo = 0;
  private dayAge = 1;
  private time: TimeOfDay = 'am';

  private readonly sun = new THREE.Group();
  private readonly sunRays: THREE.Sprite;
  private readonly sunGlow: THREE.Sprite;
  private readonly sunPath = new THREE.Group();

  private shade: { mesh: THREE.Mesh; paint: THREE.MeshBasicMaterial; now: number; want: number; wait: number }[] = [];
  private preview: { mesh: THREE.Mesh; paint: THREE.MeshBasicMaterial }[] = [];
  private readonly houses = new Map<number, HouseView>();
  private ghost: { view: HouseView; height: number } | null = null;
  private selected = -1;
  private readonly pick: THREE.Mesh;
  private readonly cats = new Map<number, CatView>();
  private readonly flowers = new Map<number, FlowerView>();

  private readonly sparks: Spark[] = [];
  private readonly sparkShape = new THREE.BufferGeometry();
  private readonly sparkPaint: THREE.ShaderMaterial;
  private readonly zeds: Zed[] = [];

  // Textures made once.
  private readonly halo: THREE.Texture;
  private readonly hatch: THREE.Texture;
  private readonly digits = new Map<number, THREE.Texture>();
  private readonly badges: Record<TimeOfDay, THREE.Texture>;
  private readonly alarmPaint: THREE.Texture;
  private readonly zedPaint: THREE.Texture;
  private readonly tileShape: THREE.BufferGeometry;
  private readonly ringShape = new THREE.TorusGeometry(0.4, 0.035, 6, 30);
  private readonly ball = new THREE.SphereGeometry(1, 20, 14);
  private readonly edge = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

  private calm = 0;

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    // Colours go to the screen as painted: no filmic curve to grey them down.
    this.renderer.toneMapping = THREE.NoToneMapping;

    this.scene.add(this.skyLight, this.sunLight, this.sunLight.target);
    // A little light from the viewer's side, so faces turned away from the sun are never black.
    const fill = new THREE.DirectionalLight(0xfff1e0, 0.7);
    fill.position.set(0, 6, 9);
    this.scene.add(fill);

    this.halo = painted(128, (ink, size) => {
      const glow = ink.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      glow.addColorStop(0, 'rgba(255,255,255,1)');
      glow.addColorStop(0.4, 'rgba(255,255,255,0.4)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ink.fillStyle = glow;
      ink.fillRect(0, 0, size, size);
    });
    this.hatch = painted(64, (ink, size) => {
      ink.fillStyle = 'rgba(255,255,255,0.72)';
      ink.fillRect(0, 0, size, size);
      ink.strokeStyle = '#ffffff';
      ink.lineWidth = 9;
      for (let i = -size; i < size * 2; i += 22) {
        ink.beginPath();
        ink.moveTo(i, size);
        ink.lineTo(i + size, 0);
        ink.stroke();
      }
    });
    this.hatch.wrapS = THREE.RepeatWrapping;
    this.hatch.wrapT = THREE.RepeatWrapping;
    this.hatch.repeat.set(2.4, 2.4);

    const sunFace = painted(256, (ink, size) => {
      const mid = size / 2;
      ink.translate(mid, mid);
      ink.fillStyle = '#ffb21e';
      for (let i = 0; i < 12; i++) {
        ink.rotate(Math.PI / 6);
        ink.beginPath();
        ink.moveTo(-size * 0.055, -size * 0.3);
        ink.lineTo(0, -size * 0.47);
        ink.lineTo(size * 0.055, -size * 0.3);
        ink.closePath();
        ink.fill();
      }
    });
    this.sunRays = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunFace, depthWrite: false }));
    this.sunRays.scale.setScalar(1.05);
    this.sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.halo, color: 0xfff3c2, opacity: 0.55, transparent: true, depthWrite: false })
    );
    this.sunGlow.scale.setScalar(1.8);
    const core = new THREE.Mesh(this.ball, new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    core.scale.setScalar(0.29);
    const cheek = new THREE.Mesh(this.ball, new THREE.MeshBasicMaterial({ color: 0xffb21e }));
    cheek.scale.set(0.29, 0.29, 0.29);
    cheek.position.set(0.035, -0.035, -0.05);
    this.sun.add(this.sunGlow, this.sunRays, cheek, core);
    this.scene.add(this.sun, this.sunPath);

    const badge = (time: TimeOfDay) =>
      painted(128, (ink, size) => {
        const mid = size / 2;
        const tint = `#${NAP_COLOUR[time].toString(16).padStart(6, '0')}`;
        ink.fillStyle = '#ffffff';
        ink.strokeStyle = tint;
        ink.lineWidth = 12;
        ink.beginPath();
        ink.arc(mid, mid, mid - 9, 0, Math.PI * 2);
        ink.fill();
        ink.stroke();
        // The sky's arc, and the sun where it stands at this cat's nap time: right, top or left.
        ink.setLineDash([6, 9]);
        ink.lineWidth = 7;
        ink.strokeStyle = 'rgba(27,39,102,0.6)';
        ink.beginPath();
        ink.arc(mid, mid + 18, 34, Math.PI, 0);
        ink.stroke();
        ink.setLineDash([]);
        const at = { am: [mid + 34, mid + 18], noon: [mid, mid - 16], pm: [mid - 34, mid + 18] }[time];
        ink.fillStyle = tint;
        ink.strokeStyle = '#1b2766';
        ink.lineWidth = 6;
        ink.beginPath();
        ink.arc(at[0] ?? mid, at[1] ?? mid, 20, 0, Math.PI * 2);
        ink.fill();
        ink.stroke();
      });
    this.badges = { am: badge('am'), noon: badge('noon'), pm: badge('pm') };
    this.alarmPaint = painted(96, (ink, size) => {
      ink.fillStyle = '#ff5a4d';
      ink.beginPath();
      ink.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
      ink.fill();
      ink.fillStyle = '#ffffff';
      ink.font = `900 ${size * 0.62}px system-ui, sans-serif`;
      ink.textAlign = 'center';
      ink.textBaseline = 'middle';
      ink.fillText('!', size / 2, size / 2 + 3);
    });
    this.zedPaint = painted(64, (ink, size) => {
      ink.fillStyle = '#1b2766';
      ink.font = `900 ${size * 0.8}px system-ui, sans-serif`;
      ink.textAlign = 'center';
      ink.textBaseline = 'middle';
      ink.fillText('z', size / 2, size / 2);
    });

    // A paving-stone-sized patch of shade: a rounded square lying on the ground.
    const outline = new THREE.Shape();
    const half = 0.46;
    const corner = 0.1;
    outline.moveTo(-half + corner, -half);
    outline.lineTo(half - corner, -half);
    outline.quadraticCurveTo(half, -half, half, -half + corner);
    outline.lineTo(half, half - corner);
    outline.quadraticCurveTo(half, half, half - corner, half);
    outline.lineTo(-half + corner, half);
    outline.quadraticCurveTo(-half, half, -half, half - corner);
    outline.lineTo(-half, -half + corner);
    outline.quadraticCurveTo(-half, -half, -half + corner, -half);
    this.tileShape = new THREE.ShapeGeometry(outline, 6);
    this.tileShape.rotateX(-Math.PI / 2);

    this.pick = new THREE.Mesh(this.ringShape, new THREE.MeshBasicMaterial({ color: 0xffb21e }));
    this.pick.rotation.x = Math.PI / 2;
    this.pick.visible = false;
    this.scene.add(this.pick);

    this.sparkShape.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOST_SPARKS * 3), 3));
    this.sparkShape.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MOST_SPARKS * 3), 3));
    this.sparkShape.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MOST_SPARKS), 1));
    this.sparkShape.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(MOST_SPARKS), 1));
    this.sparkShape.setDrawRange(0, 0);
    this.sparkPaint = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aSize;
        attribute vec3 aColor;
        attribute float aAlpha;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          vec4 seen = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / -seen.z;
          gl_Position = projectionMatrix * seen;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float far = length(gl_PointCoord - 0.5);
          if (far > 0.5) discard;
          gl_FragColor = vec4(vColor, smoothstep(0.5, 0.28, far) * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const cloud = new THREE.Points(this.sparkShape, this.sparkPaint);
    cloud.frustumCulled = false;
    this.scene.add(cloud, this.town);

    requestAnimationFrame(this.frame);
  }

  // ---------- building a town ----------

  load(puzzle: Puzzle, time: TimeOfDay): void {
    this.scene.remove(this.town);
    this.town.traverse((thing) => {
      if (thing instanceof THREE.InstancedMesh) thing.dispose();
    });
    this.town = new THREE.Group();
    this.scene.add(this.town);
    this.size = puzzle.size;
    this.houses.clear();
    this.cats.clear();
    this.flowers.clear();
    this.ghost = null;
    this.selected = -1;
    this.pick.visible = false;
    this.calm = 0;
    this.sparks.length = 0;
    for (const zed of this.zeds) this.scene.remove(zed.sprite);
    this.zeds.length = 0;

    const n = puzzle.size;
    // The square: a slab of sandstone with paving stones on top and a low whitewashed wall round it.
    const slab = new THREE.Mesh(
      new RoundedBoxGeometry(n + 1.2, 0.7, n + 1.2, 3, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xcf8452, roughness: 0.95 })
    );
    slab.position.y = -0.36;
    this.town.add(slab);
    const stone = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.95, 0.1, 0.95, 2, 0.035),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
      n * n
    );
    const place = new THREE.Matrix4();
    const tint = new THREE.Color();
    for (let cell = 0; cell < n * n; cell++) {
      const at = this.spot(cell);
      stone.setMatrixAt(cell, place.makeTranslation(at.x, 0, at.z));
      const light = (cell + Math.floor(cell / n) * (n % 2 === 0 ? 1 : 0)) % 2 === 0;
      stone.setColorAt(cell, tint.setHex(light ? 0xfff1cf : 0xfbe3b0).offsetHSL(0, 0, (grain(cell, 1) - 0.5) * 0.02));
    }
    this.town.add(stone);
    const wall = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x4f78e6, roughness: 0.6 });
    const reach = n / 2 + 0.36;
    for (const [x, z, long] of [
      [0, -reach, true],
      [0, reach, true],
      [-reach, 0, false],
      [reach, 0, false],
    ] as const) {
      const side = new THREE.Mesh(new RoundedBoxGeometry(long ? n + 0.95 : 0.2, 0.16, long ? 0.2 : n + 0.95, 2, 0.05), wall);
      side.position.set(x, 0.05, z);
      const cap = new THREE.Mesh(new RoundedBoxGeometry(long ? n + 0.95 : 0.11, 0.05, long ? 0.11 : n + 0.95, 2, 0.02), trim);
      cap.position.set(x, 0.15, z);
      this.town.add(side, cap);
    }
    // Orange trees in pots at the two back corners, out of the way of everything.
    const pot = new THREE.MeshStandardMaterial({ color: 0xd9643a, roughness: 0.8 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x4fa35a, roughness: 0.8 });
    const fruit = new THREE.MeshStandardMaterial({ color: 0xff9a2e, roughness: 0.5 });
    for (const side of [-1, 1]) {
      const tree = new THREE.Group();
      const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.26, 12), pot);
      tub.position.y = 0.2;
      const crown = new THREE.Mesh(this.ball, leaf);
      crown.scale.set(0.32, 0.3, 0.32);
      crown.position.y = 0.66;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x8a5a3a }));
      trunk.position.y = 0.42;
      tree.add(tub, trunk, crown);
      for (let i = 0; i < 4; i++) {
        const orange = new THREE.Mesh(this.ball, fruit);
        orange.scale.setScalar(0.055);
        orange.position.set(Math.cos(i * 1.7 + side) * 0.26, 0.6 + grain(i, 5) * 0.2, Math.sin(i * 1.7 + side) * 0.26);
        tree.add(orange);
      }
      tree.position.set(side * (reach + 0.02), 0.05, -reach - 0.02);
      this.town.add(tree);
    }

    // Shade and its preview: one patch per tile, faded in and out.
    this.shade = [];
    this.preview = [];
    for (let cell = 0; cell < n * n; cell++) {
      const at = this.spot(cell);
      const paint = new THREE.MeshBasicMaterial({ color: 0x1f2c7c, map: this.hatch, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(this.tileShape, paint);
      mesh.position.set(at.x, 0.058, at.z);
      mesh.visible = false;
      this.town.add(mesh);
      this.shade.push({ mesh, paint, now: 0, want: 0, wait: 0 });
      const light = new THREE.MeshBasicMaterial({ color: 0x1f2c7c, map: this.hatch, transparent: true, opacity: 0.3, depthWrite: false });
      const hint = new THREE.Mesh(this.tileShape, light);
      hint.position.set(at.x, 0.062, at.z);
      hint.visible = false;
      this.town.add(hint);
      this.preview.push({ mesh: hint, paint: light });
    }

    for (const cell of puzzle.wells) this.digWell(cell);
    for (const cell of puzzle.flowers) this.plantFlower(cell);
    for (const cat of puzzle.cats) this.seatCat(cat.cell, cat.nap);

    // The sun's road across the sky, with a bigger bead at each of its three stops.
    this.sunPath.clear();
    const bead = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
    for (let i = 0; i <= 24; i++) {
      const dot = new THREE.Mesh(this.ball, bead);
      dot.position.copy(this.sunAt((i / 24) * 2));
      dot.scale.setScalar(i % 12 === 0 ? 0.075 : 0.035);
      this.sunPath.add(dot);
    }

    this.time = time;
    this.day = this.dayFrom = this.dayTo = DAY[time];
    this.dayAge = 1;
    this.resize();
  }

  /** Where a tile's middle is in the model. Row 0 is nearest the viewer. */
  private spot(cell: number): { x: number; z: number } {
    const mid = (this.size - 1) / 2;
    return { x: (cell % this.size) - mid, z: mid - Math.floor(cell / this.size) };
  }

  /** Where the sun hangs: over the back-right corner in the morning, high over the back at noon, back-left in the evening. */
  private sunAt(day: number): THREE.Vector3 {
    const turn = (day * Math.PI) / 2;
    return new THREE.Vector3(Math.cos(turn) * (this.size / 2 + 0.15), 1.2 + Math.sin(turn) * 0.95, -(this.size / 2 + 0.8));
  }

  /** Gives a shape an ink outline: a slightly bigger copy of it, drawn inside-out behind it. */
  private inked<T extends THREE.Mesh>(mesh: T, thick = 1.1): T {
    const rim = new THREE.Mesh(mesh.geometry, this.edge);
    rim.scale.setScalar(thick);
    mesh.add(rim);
    return mesh;
  }

  private blob(radius: number): THREE.Mesh {
    const mark = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 20),
      new THREE.MeshBasicMaterial({ color: 0x5a3a1e, transparent: true, opacity: 0.22, depthWrite: false })
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.y = 0.056;
    return mark;
  }

  private warning(): THREE.Mesh {
    const ring = new THREE.Mesh(this.ringShape, new THREE.MeshBasicMaterial({ color: 0xff5a4d }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    ring.visible = false;
    return ring;
  }

  private digWell(cell: number): void {
    const at = this.spot(cell);
    const well = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 8, 22), new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.8 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.11;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.29, 22), new THREE.MeshStandardMaterial({ color: 0x4fb3e8, roughness: 0.1 }));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.1;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.07, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    glint.rotation.x = -Math.PI / 2;
    glint.position.set(-0.08, 0.105, -0.08);
    well.add(rim, water, glint);
    well.position.set(at.x, 0, at.z);
    this.town.add(well);
  }

  /** A potted flower with a round, open face. It looks up at the player in the sun and droops in shade. */
  private plantFlower(cell: number): void {
    const at = this.spot(cell);
    const group = new THREE.Group();
    const grown = new THREE.Group();
    const colour = new THREE.Color(pick(PETALS, Math.floor(grain(cell, 20) * PETALS.length), PETALS[0]));
    const tub = this.inked(
      new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xe0683c, roughness: 0.8 })),
      1.1
    );
    tub.position.y = 0.15;
    const green = new THREE.MeshStandardMaterial({ color: 0x45a856, roughness: 0.7 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.32, 6), green);
    stem.position.y = 0.4;
    grown.add(tub, stem);
    for (const side of [-1, 1]) {
      const blade = new THREE.Mesh(this.ball, green);
      blade.scale.set(0.13, 0.035, 0.07);
      blade.position.set(side * 0.11, 0.33, 0.02);
      blade.rotation.z = side * 0.55;
      grown.add(blade);
    }
    const head = new THREE.Group();
    head.position.y = 0.58;
    const petals = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 });
    for (let i = 0; i < 7; i++) {
      const petal = this.inked(new THREE.Mesh(this.ball, petals), 1.14);
      const turn = (i / 7) * Math.PI * 2;
      petal.scale.set(0.105, 0.04, 0.105);
      petal.position.set(Math.sin(turn) * 0.145, 0, Math.cos(turn) * 0.145);
      head.add(petal);
    }
    const heart = this.inked(new THREE.Mesh(this.ball, new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 })), 1.14);
    heart.scale.set(0.095, 0.065, 0.095);
    heart.position.y = 0.02;
    head.add(heart);
    grown.add(head);
    grown.scale.setScalar(1.18);
    const ring = this.warning();
    group.add(this.blob(0.26), grown, ring);
    group.position.set(at.x, 0, at.z);
    this.town.add(group);
    this.flowers.set(cell, { group, head, petals, ring, colour, lit: true, trouble: false, open: 1, pop: 0 });
  }

  /** A cat with a big head, pointed ears, a pale muzzle and chest, front paws and a tail, sitting on its nap-time mat. */
  private seatCat(cell: number, nap: TimeOfDay): void {
    const at = this.spot(cell);
    const group = new THREE.Group();
    const coat = pick(FUR, Math.floor(grain(cell, 30) * FUR.length), FUR[0]);
    const black = coat === 0x43435a;
    const fur = new THREE.MeshStandardMaterial({ color: coat, roughness: 0.8 });
    const pale = new THREE.MeshStandardMaterial({ color: coat === 0xffffff ? 0xf1ece4 : 0xfffaf0, roughness: 0.8 });
    const eyePaint = new THREE.MeshStandardMaterial({ color: black ? 0xffe27a : INK, roughness: 0.25 });
    const pink = new THREE.MeshStandardMaterial({ color: 0xff8fb1, roughness: 0.6 });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const part = (material: THREE.Material, sx: number, sy: number, sz: number) => {
      const mesh = new THREE.Mesh(this.ball, material);
      mesh.scale.set(sx, sy, sz);
      return mesh;
    };

    const body = this.inked(part(fur, 0.2, 0.24, 0.19), 1.09);
    const chest = part(pale, 0.115, 0.14, 0.07);
    const paws = [-1, 1].map(() => part(pale, 0.055, 0.045, 0.065));

    const head = new THREE.Group();
    head.add(this.inked(part(fur, 0.21, 0.178, 0.178), 1.09));
    for (const side of [-1, 1]) {
      const ear = this.inked(new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.16, 4), fur), 1.18);
      ear.position.set(side * 0.128, 0.175, -0.01);
      ear.rotation.set(0, side * 0.5, -side * 0.3);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.1, 4), pink);
      inner.position.set(side * 0.124, 0.163, 0.02);
      inner.rotation.copy(ear.rotation);
      head.add(ear, inner);
    }
    const muzzle = part(pale, 0.09, 0.062, 0.05);
    muzzle.position.set(0, -0.058, 0.148);
    const nose = part(pink, 0.025, 0.018, 0.02);
    nose.position.set(0, -0.032, 0.198);
    head.add(muzzle, nose);
    const eyes: THREE.Mesh[] = [];
    const glints: THREE.Mesh[] = [];
    for (const side of [-1, 1]) {
      const eye = part(eyePaint, 0.036, 0.048, 0.02);
      eye.position.set(side * 0.088, 0.022, 0.16);
      const glint = part(white, 0.012, 0.012, 0.008);
      glint.position.set(side * 0.088 + 0.012, 0.04, 0.178);
      head.add(eye, glint);
      eyes.push(eye);
      glints.push(glint);
    }

    const tail = new THREE.Group();
    const tip = this.inked(new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 4, 8), fur), 1.2);
    tip.position.y = 0.16;
    tail.add(tip);
    tail.position.set(0.14, 0.1, -0.13);

    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.badges[nap], depthTest: false, transparent: true }));
    badge.position.set(0, 1.26, 0);
    badge.renderOrder = 5;
    const alarm = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.alarmPaint, depthTest: false, transparent: true }));
    alarm.scale.setScalar(0.3);
    alarm.position.set(-0.36, 1.0, 0);
    alarm.renderOrder = 6;
    alarm.visible = false;
    const ring = this.warning();
    // The mat says when this cat naps: pink for morning, yellow for noon, violet for evening.
    const mat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.43, 0.43, 0.03, 28),
      new THREE.MeshStandardMaterial({ color: NAP_COLOUR[nap], roughness: 0.7, emissive: NAP_COLOUR[nap], emissiveIntensity: 0 })
    );
    mat.position.y = 0.065;
    const model = new THREE.Group();
    model.add(body, chest, ...paws, head, tail);
    model.scale.setScalar(1.14);
    group.add(mat, model, badge, alarm, ring);
    group.position.set(at.x, 0, at.z);
    this.town.add(group);
    this.cats.set(cell, { group, body, chest, paws, head, eyes, glints, tail, badge, alarm, ring, mat, nap, asleep: false, trouble: false, doze: 0, zIn: grain(cell, 31), hop: 0 });
  }

  private digit(height: number): THREE.Texture {
    const made = this.digits.get(height);
    if (made) return made;
    const texture = painted(128, (ink, size) => {
      const mid = size / 2;
      ink.fillStyle = '#ffffff';
      ink.strokeStyle = '#1b2766';
      ink.lineWidth = 9;
      ink.beginPath();
      ink.arc(mid, mid, mid - 8, 0, Math.PI * 2);
      ink.fill();
      ink.stroke();
      ink.fillStyle = '#1b2766';
      ink.font = `900 ${size * 0.62}px system-ui, sans-serif`;
      ink.textAlign = 'center';
      ink.textBaseline = 'middle';
      ink.fillText(String(height), mid, mid + 4);
    });
    this.digits.set(height, texture);
    return texture;
  }

  /** A whitewashed house with a terracotta roof: one row of windows per storey, and its height on a sign. */
  private build(height: number): HouseView {
    const group = new THREE.Group();
    const tall = 0.22 + STOREY * height;
    const walls = new THREE.MeshStandardMaterial({ color: pick(WALLS, height - 1, WALLS[0]), roughness: 0.85 });
    const tiles = new THREE.MeshStandardMaterial({ color: 0xe85f35, roughness: 0.7 });
    const windows = new THREE.MeshStandardMaterial({ color: 0x3559c7, roughness: 0.3, emissive: 0xffc247, emissiveIntensity: 0 });
    const body = this.inked(new THREE.Mesh(new RoundedBoxGeometry(0.78, tall, 0.78, 2, 0.05), walls), 1.045);
    body.position.y = 0.05 + tall / 2;
    const roof = this.inked(new THREE.Mesh(new THREE.ConeGeometry(0.66, 0.36, 4), tiles), 1.07);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.05 + tall + 0.17;
    const panes: THREE.BufferGeometry[] = [];
    const pane = (x: number, y: number, z: number, w: number, h: number, sideways: boolean) => {
      const glass = new THREE.BoxGeometry(sideways ? 0.02 : w, h, sideways ? w : 0.02);
      glass.translate(x, y, z);
      panes.push(glass);
    };
    for (let storey = 0; storey < height; storey++) {
      const y = 0.05 + 0.2 + storey * STOREY;
      if (storey === 0) {
        pane(0, 0.05 + 0.13, 0.392, 0.16, 0.25, false);
        pane(-0.25, y, 0.392, 0.11, 0.13, false);
        pane(0.25, y, 0.392, 0.11, 0.13, false);
      } else {
        pane(-0.18, y, 0.392, 0.14, 0.14, false);
        pane(0.18, y, 0.392, 0.14, 0.14, false);
      }
      pane(0.392, y, 0, 0.14, 0.14, true);
      pane(-0.392, y, 0, 0.14, 0.14, true);
    }
    const glassWork = new THREE.Mesh(mergeGeometries(panes) ?? new THREE.BufferGeometry(), windows);
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.digit(height), depthTest: false, transparent: true }));
    sign.scale.setScalar(0.48);
    sign.position.y = 0.05 + tall + 0.56;
    sign.renderOrder = 5;
    group.add(this.blob(0.5), body, roof, glassWork, sign);
    return { group, paints: [walls, tiles, windows], windows, cell: -1, height, age: 9, fade: 1, lifted: false };
  }

  // ---------- what the game tells the stage ----------

  /** Slides the sun to a time of day. Shadows are set separately, with `setShade`. */
  setTime(time: TimeOfDay, animate: boolean): void {
    this.time = time;
    this.dayFrom = this.day;
    this.dayTo = DAY[time];
    this.dayAge = animate && !this.reducedMotion ? 0 : 1;
    if (this.dayAge === 1) this.day = this.dayTo;
  }

  /**
   * The houses standing on the square: where each is, how tall, which one is picked up by a tap, and
   * which one has just been put down (it drops in with a puff of dust).
   */
  setHouses(standing: { i: number; cell: number; height: number }[], selected: number, justPlaced: number): void {
    const keep = new Set(standing.map((house) => house.i));
    for (const [i, view] of this.houses) {
      if (keep.has(i)) continue;
      this.town.remove(view.group);
      this.houses.delete(i);
    }
    for (const house of standing) {
      let view = this.houses.get(house.i);
      if (!view || view.height !== house.height) {
        if (view) this.town.remove(view.group);
        view = this.build(house.height);
        this.houses.set(house.i, view);
        this.town.add(view.group);
      }
      const moved = view.cell !== house.cell;
      view.cell = house.cell;
      const at = this.spot(house.cell);
      view.group.position.set(at.x, 0, at.z);
      if (house.i === justPlaced && moved) {
        view.age = 0;
        this.dust(at.x, at.z);
      }
    }
    this.selected = selected;
    const picked = this.houses.get(selected);
    this.pick.visible = Boolean(picked);
    if (picked) this.pick.position.set(picked.group.position.x, 0.09, picked.group.position.z);
  }

  /** The tiles in shade right now. Each has a delay in milliseconds, so shade can sweep outwards from its house. */
  setShade(cells: Map<number, number>, sweep: boolean): void {
    this.shade.forEach((patch, cell) => {
      const delay = cells.get(cell);
      patch.want = delay === undefined ? 0 : 1;
      patch.wait = sweep && !this.reducedMotion && delay !== undefined ? delay / 1000 : 0;
      if (!sweep || this.reducedMotion) patch.now = patch.want;
    });
  }

  /** While a house is being carried: a see-through house on the tile under the finger, and the shade it would throw. */
  setPreview(cell: number | null, height: number, shade: number[]): void {
    this.preview.forEach((patch, index) => {
      patch.mesh.visible = cell !== null && shade.includes(index);
    });
    if (cell === null) {
      if (this.ghost) this.ghost.view.group.visible = false;
      return;
    }
    if (!this.ghost || this.ghost.height !== height) {
      if (this.ghost) this.town.remove(this.ghost.view.group);
      const view = this.build(height);
      for (const paint of view.paints) {
        paint.transparent = true;
        paint.opacity = 0.78;
      }
      this.ghost = { view, height };
      this.town.add(view.group);
    }
    const at = this.spot(cell);
    this.ghost.view.group.visible = true;
    this.ghost.view.group.position.set(at.x, 0.12, at.z);
  }

  /** How each cat and flower is doing, so they can show it. */
  setCreatures(
    cats: { cell: number; asleep: boolean; trouble: boolean }[],
    flowers: { cell: number; lit: boolean; trouble: boolean }[]
  ): void {
    for (const cat of cats) {
      const view = this.cats.get(cat.cell);
      if (!view) continue;
      if (cat.asleep && !view.asleep) this.twinkle(view.group.position.x, 0.5, view.group.position.z, 6, 0xfff3b0);
      view.asleep = cat.asleep;
      if (cat.trouble && !view.trouble) view.hop = 1;
      view.trouble = cat.trouble;
    }
    for (const flower of flowers) {
      const view = this.flowers.get(flower.cell);
      if (!view) continue;
      view.lit = flower.lit;
      view.trouble = flower.trouble;
    }
  }

  /** The end of a solved town: every flower opens wide and throws petals, and the light settles. */
  celebrate(): void {
    this.calm = 0.001;
    for (const view of this.flowers.values()) {
      view.pop = 1;
      const tint = view.colour.getHex();
      for (let i = 0; i < 12; i++) {
        const turn = Math.random() * Math.PI * 2;
        this.addSpark(view.group.position.x, 0.55, view.group.position.z, Math.cos(turn) * 1.6, 2 + Math.random() * 2.2, Math.sin(turn) * 1.6, 0.9 + Math.random() * 0.5, 0.11, i % 3 === 0 ? 0xffe27a : tint, 4);
      }
    }
    for (const view of this.cats.values()) this.twinkle(view.group.position.x, 0.5, view.group.position.z, 8, 0xfff3b0);
  }

  // ---------- pointing at tiles ----------

  /** The tile under a point on the page, or null when it is off the square. */
  cellAt(clientX: number, clientY: number): number | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const point = new THREE.Vector2(((clientX - box.left) / box.width) * 2 - 1, -((clientY - box.top) / box.height) * 2 + 1);
    this.ray.setFromCamera(point, this.camera);
    const hit = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.floor, hit)) return null;
    const mid = (this.size - 1) / 2;
    const col = Math.round(hit.x + mid);
    const row = Math.round(mid - hit.z);
    if (col < 0 || row < 0 || col >= this.size || row >= this.size) return null;
    return row * this.size + col;
  }

  /** Where a tile's middle is on the page. */
  cellCenter(cell: number): { x: number; y: number } {
    const at = this.spot(cell);
    const box = this.canvas.getBoundingClientRect();
    const seen = new THREE.Vector3(at.x, 0.1, at.z).project(this.camera);
    return { x: box.left + ((seen.x + 1) / 2) * box.width, y: box.top + ((1 - seen.y) / 2) * box.height };
  }

  /** Roughly how wide a tile is on the page, in pixels. */
  cellPixels(): number {
    const a = this.cellCenter(0);
    const b = this.cellCenter(1);
    return Math.max(24, Math.abs(b.x - a.x));
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Everything that has to be in the picture: the slab, the tallest house and a cat's badge in
    // the back row, the corner trees, and the sun at each end and at the top of its arc.
    const n = this.size;
    const edge = n / 2 + 0.6;
    const noon = this.sunAt(1);
    const morning = this.sunAt(0);
    const must = [
      new THREE.Vector3(-edge, -1.3, edge),
      new THREE.Vector3(edge, -1.3, edge),
      new THREE.Vector3(-edge, 0.2, edge),
      new THREE.Vector3(edge, 0.2, edge),
      new THREE.Vector3(-edge, 0.95, -edge),
      new THREE.Vector3(edge, 0.95, -edge),
      new THREE.Vector3(-n / 2 + 0.5, 1.95, -n / 2 + 0.5),
      new THREE.Vector3(n / 2 - 0.5, 1.95, -n / 2 + 0.5),
      new THREE.Vector3(0, noon.y + 0.6, noon.z),
      new THREE.Vector3(morning.x + 0.6, morning.y + 0.5, morning.z),
      new THREE.Vector3(-morning.x - 0.6, morning.y + 0.5, morning.z),
    ];
    const half = Math.tan((FIELD_OF_VIEW * Math.PI) / 360);
    const lookAt = new THREE.Vector3(0, 0.5, 0);
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const seen = new THREE.Vector3();
    let distance = n * 3 + 8;
    // Perspective makes this not quite linear, so home in on it over a few passes.
    for (let pass = 0; pass < 10; pass++) {
      this.camera.position.set(lookAt.x, lookAt.y + Math.sin(LOOK_DOWN) * distance, lookAt.z + Math.cos(LOOK_DOWN) * distance);
      this.camera.lookAt(lookAt);
      this.camera.updateMatrixWorld();
      let left = Infinity;
      let rightmost = -Infinity;
      let low = Infinity;
      let high = -Infinity;
      for (const point of must) {
        seen.copy(point).project(this.camera);
        left = Math.min(left, seen.x);
        rightmost = Math.max(rightmost, seen.x);
        low = Math.min(low, seen.y);
        high = Math.max(high, seen.y);
      }
      // The picture runs from -1 to 1 each way. Leave a sliver of margin.
      const grow = Math.max(rightmost - left, high - low) / 1.94;
      right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      up.setFromMatrixColumn(this.camera.matrixWorld, 1);
      lookAt.addScaledVector(right, ((left + rightmost) / 2) * distance * half * this.camera.aspect);
      lookAt.addScaledVector(up, ((low + high) / 2) * distance * half);
      distance *= grow;
    }
    this.camera.position.set(lookAt.x, lookAt.y + Math.sin(LOOK_DOWN) * distance, lookAt.z + Math.cos(LOOK_DOWN) * distance);
    this.camera.lookAt(lookAt);
    this.camera.updateMatrixWorld();
    this.sparkPaint.uniforms['uScale'] = { value: (height * this.renderer.getPixelRatio()) / (2 * half) };
  }

  // ---------- particles ----------

  private addSpark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, colour: number, gravity: number): void {
    if (this.reducedMotion) return;
    if (this.sparks.length >= MOST_SPARKS) this.sparks.shift();
    const tint = new THREE.Color(colour);
    this.sparks.push({ x, y, z, vx, vy, vz, life, age: 0, size, r: tint.r, g: tint.g, b: tint.b, gravity });
  }

  private dust(x: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      const turn = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      this.addSpark(x + Math.cos(turn) * 0.3, 0.1, z + Math.sin(turn) * 0.3, Math.cos(turn) * 1.3, 0.5 + Math.random() * 0.6, Math.sin(turn) * 1.3, 0.45 + Math.random() * 0.25, 0.2, i % 2 === 0 ? 0xfff6e0 : 0xf0d49a, 1.2);
    }
  }

  private twinkle(x: number, y: number, z: number, count: number, colour: number): void {
    for (let i = 0; i < count; i++) {
      const turn = Math.random() * Math.PI * 2;
      this.addSpark(x + Math.cos(turn) * 0.2, y + Math.random() * 0.3, z + Math.sin(turn) * 0.2, Math.cos(turn) * 0.5, 0.7 + Math.random() * 0.7, Math.sin(turn) * 0.5, 0.7 + Math.random() * 0.4, 0.1, colour, -0.2);
    }
  }

  private snore(x: number, y: number, z: number): void {
    if (this.reducedMotion || this.zeds.length > 18) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zedPaint, transparent: true, depthTest: false }));
    sprite.renderOrder = 6;
    this.scene.add(sprite);
    this.zeds.push({ sprite, age: 0, life: 1.6, x, y, z });
  }

  // ---------- every frame ----------

  private readonly frame = (ms: number): void => {
    requestAnimationFrame(this.frame);
    const now = ms / 1000;
    const dt = Math.min(0.05, now - this.last);
    this.last = now;
    if (document.hidden) return;
    if (this.canvas.clientWidth !== this.width || this.canvas.clientHeight !== this.height) this.resize();
    this.clock += dt;
    const lively = this.reducedMotion ? 0 : 1;

    // The sun glides along its road; the light takes its colour from where the sun is.
    if (this.dayAge < 1) {
      this.dayAge = Math.min(1, this.dayAge + dt / 0.6);
      this.day = lerp(this.dayFrom, this.dayTo, ease(this.dayAge));
    }
    const sunSpot = this.sunAt(this.day);
    this.sun.position.copy(sunSpot);
    this.sunRays.material.rotation = this.clock * 0.25 * lively;
    this.sunGlow.scale.setScalar(1.8 + Math.sin(this.clock * 2) * 0.08 * lively);
    const lower = LIGHT[Math.min(1, Math.floor(this.day))] ?? LIGHT[0];
    const upper = LIGHT[Math.min(2, Math.floor(this.day) + 1)] ?? LIGHT[2];
    const blend = this.day - Math.min(1, Math.floor(this.day));
    this.sunLight.color.setHex(lower.sun).lerp(new THREE.Color(upper.sun), blend);
    this.sunLight.intensity = lerp(lower.power, upper.power, blend);
    this.skyLight.color.setHex(lower.sky).lerp(new THREE.Color(upper.sky), blend);
    this.skyLight.groundColor.setHex(lower.ground).lerp(new THREE.Color(upper.ground), blend);
    const turn = (this.day * Math.PI) / 2;
    this.sunLight.position.set(Math.cos(turn) * 8, 7 + Math.sin(turn) * 5, 3.5 - Math.sin(turn) * 7);
    this.sunLight.target.position.set(0, 0, 0);
    // In the evening the windows light up.
    const lamps = Math.max(0, this.day - 1.4) / 0.6;
    if (this.calm > 0) this.calm = Math.min(1, this.calm + dt * 0.8);

    for (const patch of this.shade) {
      if (patch.wait > 0) patch.wait -= dt;
      else patch.now += (patch.want - patch.now) * Math.min(1, dt * 14);
      patch.paint.opacity = patch.now * 0.5;
      patch.mesh.visible = patch.now > 0.01;
    }

    // Houses drop in with a bounce, and thin out when something is hidden behind them.
    for (const [i, view] of this.houses) {
      view.age += dt;
      const t = Math.min(1, view.age / 0.42);
      const fall = this.reducedMotion ? 0 : (1 - t) * (1 - t) * 1.1;
      const squash = this.reducedMotion ? 0 : Math.sin(Math.min(1, view.age / 0.5) * Math.PI) * Math.exp(-view.age * 5) * 0.45;
      const bob = i === this.selected ? 0.1 + Math.sin(this.clock * 5) * 0.04 * lively : 0;
      view.group.position.y = fall + bob;
      view.group.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      const hides = this.hidesSomething(view);
      view.fade += ((hides ? 0.6 : 1) - view.fade) * Math.min(1, dt * 10);
      for (const paint of view.paints) {
        const thin = view.fade < 0.98;
        if (paint.transparent !== thin) {
          paint.transparent = thin;
          paint.needsUpdate = true;
        }
        paint.opacity = thin ? view.fade : 1;
      }
      view.windows.emissiveIntensity = lamps * 1.4;
    }
    if (this.pick.visible) this.pick.scale.setScalar(1 + Math.sin(this.clock * 5) * 0.06 * lively);
    if (this.ghost?.view.group.visible) this.ghost.view.group.position.y = 0.14 + Math.sin(this.clock * 6) * 0.04 * lively;

    for (const [cell, view] of this.cats) this.poseCat(cell, view, dt, lively);
    for (const view of this.flowers.values()) this.poseFlower(view, dt, lively);

    for (let i = this.zeds.length - 1; i >= 0; i--) {
      const zed = this.zeds[i];
      if (!zed) continue;
      zed.age += dt;
      const t = zed.age / zed.life;
      zed.sprite.position.set(zed.x + Math.sin(zed.age * 3) * 0.08 + t * 0.2, zed.y + t * 0.6, zed.z);
      zed.sprite.scale.setScalar(0.12 + t * 0.14);
      zed.sprite.material.opacity = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      if (t >= 1) {
        this.scene.remove(zed.sprite);
        zed.sprite.material.dispose();
        this.zeds.splice(i, 1);
      }
    }

    this.stirSparks(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /** True when a cat or a flower sits straight behind a house, where its walls would hide it. */
  private hidesSomething(view: HouseView): boolean {
    const row = Math.floor(view.cell / this.size);
    const col = view.cell % this.size;
    const reach = view.height >= 4 ? 2 : view.height >= 2 ? 1 : 0;
    for (let back = 1; back <= reach; back++) {
      const behind = (row + back) * this.size + col;
      if (row + back >= this.size) break;
      if (this.cats.has(behind) || this.flowers.has(behind)) return true;
    }
    return false;
  }

  private poseCat(cell: number, view: CatView, dt: number, lively: number): void {
    view.doze += ((view.asleep ? 1 : 0) - view.doze) * Math.min(1, dt * (this.reducedMotion ? 60 : 7));
    const d = view.doze;
    const breath = Math.sin(this.clock * (view.asleep ? 2 : 3.4) + cell) * 0.012 * lively;
    // Sitting up straight, or curled into a loaf with its head down on its paws.
    view.body.scale.set(lerp(0.2, 0.29, d), lerp(0.24, 0.15, d) + breath, lerp(0.19, 0.25, d));
    view.body.position.set(0, 0.05 + lerp(0.24, 0.15, d), 0);
    view.chest.position.set(0, 0.05 + 0.25, 0.135);
    view.chest.scale.set(0.115 * (1 - d), 0.14 * (1 - d), 0.07 * (1 - d));
    view.paws.forEach((paw, index) => {
      const side = index === 0 ? -1 : 1;
      paw.position.set(lerp(side * 0.08, 0.1 + side * 0.07, d), 0.05 + lerp(0.045, 0.05, d), lerp(0.17, 0.26, d));
    });
    view.head.position.set(lerp(0, 0.12, d), 0.05 + lerp(0.61, 0.21, d), lerp(0.04, 0.2, d));
    view.head.rotation.z = lerp(Math.sin(this.clock * 0.9 + cell) * 0.07 * lively, -0.42, d);
    view.head.rotation.x = lerp(0, 0.3, d);
    for (const eye of view.eyes) eye.scale.y = lerp(0.048, 0.006, d);
    for (const glint of view.glints) glint.scale.setScalar(0.012 * (1 - d));
    view.tail.rotation.z = lerp(-0.55 + Math.sin(this.clock * 2.6 + cell) * 0.32 * lively, -1.52, d);
    view.tail.rotation.y = lerp(0, 2.2, d);
    view.tail.position.set(lerp(0.14, 0.2, d), lerp(0.1, 0.09, d), lerp(-0.13, 0.02, d));

    // A cat in trouble hops and shows an exclamation mark; its tile gets a ring.
    view.hop = Math.max(0, view.hop - dt * 1.6);
    const jump = view.trouble ? Math.abs(Math.sin(this.clock * 7)) * 0.07 * lively : Math.sin(view.hop * Math.PI) * 0.12;
    view.group.position.y = jump;
    view.alarm.visible = view.trouble;
    view.alarm.position.y = 1.02 + Math.sin(this.clock * 6) * 0.03 * lively;
    view.ring.visible = view.trouble;
    view.ring.scale.setScalar(1 + Math.sin(this.clock * 6) * 0.07 * lively);

    // The badge over its head says when this cat naps. It is bright when that is the time on show,
    // and it comes down with the cat's head when the cat lies down.
    const onDuty = view.nap === this.time;
    const want = view.asleep ? 0.8 : onDuty ? 1 : 0.75;
    view.badge.material.opacity += (want - view.badge.material.opacity) * Math.min(1, dt * 8);
    view.badge.position.y = lerp(1.26, 0.74, d);
    view.badge.scale.setScalar(onDuty && !view.asleep ? 0.4 + Math.sin(this.clock * 4) * 0.02 * lively : 0.32);
    // The mat glows when it is this cat's time and it is still awake.
    if (view.mat.material instanceof THREE.MeshStandardMaterial)
      view.mat.material.emissiveIntensity = onDuty && !view.asleep ? 0.35 + Math.sin(this.clock * 4) * 0.2 * lively : 0;

    if (view.asleep) {
      view.zIn -= dt;
      if (view.zIn <= 0) {
        view.zIn = 0.85 + grain(cell, Math.floor(this.clock)) * 0.5;
        this.snore(view.group.position.x + 0.2, 0.55, view.group.position.z);
      }
    }
  }

  private poseFlower(view: FlowerView, dt: number, lively: number): void {
    view.open += ((view.lit ? 1 : 0) - view.open) * Math.min(1, dt * (this.reducedMotion ? 60 : 6));
    view.pop = Math.max(0, view.pop - dt * 1.4);
    const o = view.open;
    const burst = Math.sin(view.pop * Math.PI) * 0.5 + this.calm * 0.1;
    view.head.scale.setScalar(lerp(0.72, 1, o) + burst);
    // In the sun the flower turns its face up to the player; in shade it hangs its head.
    view.head.rotation.x = lerp(1.75, 0.7, o) + Math.sin(this.clock * 1.8 + view.group.position.x) * 0.06 * lively;
    view.head.position.y = lerp(0.5, 0.58, o);
    view.head.position.z = lerp(0.1, 0.03, o);
    view.petals.color.copy(view.colour).lerp(new THREE.Color(0x9aa0b5), (1 - o) * 0.8);
    view.ring.visible = view.trouble;
    view.ring.scale.setScalar(1 + Math.sin(this.clock * 6) * 0.07 * lively);
  }

  private stirSparks(dt: number): void {
    const places = this.sparkShape.getAttribute('position');
    const colours = this.sparkShape.getAttribute('aColor');
    const sizes = this.sparkShape.getAttribute('aSize');
    const alphas = this.sparkShape.getAttribute('aAlpha');
    let alive = 0;
    for (const spark of this.sparks) {
      spark.age += dt;
      if (spark.age >= spark.life) continue;
      spark.vy -= spark.gravity * dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.z += spark.vz * dt;
      const t = spark.age / spark.life;
      places.setXYZ(alive, spark.x, spark.y, spark.z);
      colours.setXYZ(alive, spark.r, spark.g, spark.b);
      sizes.setX(alive, spark.size * (1 - t * 0.4));
      alphas.setX(alive, 1 - t * t);
      this.sparks[alive] = spark;
      alive += 1;
    }
    this.sparks.length = alive;
    this.sparkShape.setDrawRange(0, alive);
    places.needsUpdate = true;
    colours.needsUpdate = true;
    sizes.needsUpdate = true;
    alphas.needsUpdate = true;
  }
}
