// Every player-facing string lives here so a human can write and edit them in one place.
// Status: agent-drafted. A human must review and sign off every line before the feature freeze.
// House style: short, warm, plain. No exclamation marks, no middle-dot lists, no arrows in buttons.
import type { NoonRule, TimeOfDay } from '../shared/engine/types.ts';
import type { LessonId } from '../shared/lessons.ts';

const when: Record<TimeOfDay, string> = {
  am: 'in the morning',
  noon: 'at noon',
  pm: 'in the evening',
};
const label: Record<TimeOfDay, string> = {
  am: 'Morning',
  noon: 'Noon',
  pm: 'Evening',
};

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : many;

export const copy = {
  gameName: 'Siesta',
  tagline: 'Put the town to sleep.',
  playToday: 'Play today’s town',
  seeYourTown: 'See your town',
  loading: 'Waking the town…',
  loadFailed: 'The town didn’t load. Check your connection and try again.',
  tryAgain: 'Try again',

  timeLabel: label,
  townNumber: (n: number, date: string) => `No. ${n}, ${date}`,
  oldTown: (n: number) =>
    `This is town No. ${n}. Today’s town is in the pinned post.`,
  difficulty: (level: number) => `Difficulty ${level} of 7`,
  difficultyWord: (level: number) =>
    level <= 2
      ? 'Gentle'
      : level <= 4
        ? 'Steady'
        : level <= 6
          ? 'Tricky'
          : 'Sunday special',
  nappedIn: (time: string) => `Napped in ${time}`,

  // Taps on the board
  catNaps: {
    am: 'This cat naps in the morning.',
    noon: 'This cat naps at noon.',
    pm: 'This cat naps in the evening.',
  },
  flowerNeedsSun: 'Flowers need sun all day.',
  wellIsFlat: 'A well is flat: no shadow, and no room for a house.',
  spotTakenByCat: 'That spot is taken by a cat.',
  spotIsFlower: 'Houses can’t go on flowers.',
  spotIsWell: 'Houses can’t go on the well.',
  spotHasHouse: 'There’s already a house there.',

  // Controls (labels for screen readers)
  houseInTray: (h: number) => `House, height ${h}`,
  houseOnBoard: (h: number) => `House ${h} is on the board`,
  putAllBack: 'Put all houses back',
  howToPlay: 'How to play',
  sound: 'Sound',
  catsAsleep: 'Cats asleep',
  flowersInSun: 'Flowers in sun',
  timeDone: (name: string, ok: boolean) => `${name} ${ok ? 'done' : 'not yet'}`,

  // Lessons
  skipLessons: 'Skip',
  lessonTitle: (n: number) => `Lesson ${n} of 3`,
  lessonSubtitle: 'How shadows work',
  lessonStep: (id: LessonId, sawNoon: boolean, rule: NoonRule): string => {
    if (id === 'lesson-1')
      return 'The sun rises on the right. Drag the house so the cat naps in its shadow.';
    if (id === 'lesson-2') {
      if (!sawNoon)
        return 'This cat naps at noon. Tap Noon to see where shadows fall.';
      return rule === 'one'
        ? 'At noon every shadow falls one tile up. Put the cat in the shade.'
        : 'At noon shadows fall up, half as long. Put the cat in the shade.';
    }
    return 'Flowers need sun all day. Shade the evening cat, but keep the flower out of every shadow.';
  },
  lessonDone: (id: LessonId, rule: NoonRule): [string, string] => {
    if (id === 'lesson-1')
      return ['That’s the idea.', 'Morning sun throws shadows to the left.'];
    if (id === 'lesson-2') {
      return [
        'Noon shadows fall up.',
        rule === 'one'
          ? 'At noon the sun is high in the south, so every house shades just the tile above it.'
          : 'At noon the sun is high in the south, so shadows fall up and are half as long.',
      ];
    }
    return [
      'You’re ready.',
      'Evening shadows fall to the right. Every town is these three ideas at once.',
    ];
  },
  next: 'Next',
  toTodaysTown: 'Play today’s town',

  // The coach line: always says what to do next
  coachGoal: (cats: number, flowers: number) => {
    const catPart =
      cats === 1 ? 'Put the cat to sleep' : `Put all ${cats} cats to sleep`;
    if (flowers === 0) return `${catPart}.`;
    return `${catPart} and keep ${plural(flowers, 'the flower', `all ${flowers} flowers`)} in the sun.`;
  },
  coachProgress: (asleep: number, total: number, housesLeft: number) =>
    `${asleep} of ${total} ${plural(total, 'cat', 'cats')} asleep. ${housesLeft} more ${plural(housesLeft, 'house', 'houses')} to place.`,
  coachFlowerShaded: (time: TimeOfDay) =>
    `A flower is in shade ${when[time]}. Tap ${label[time]} to see it.`,
  coachFlowerShadedHere: (time: TimeOfDay) =>
    `A flower is in shade ${when[time]}. Move the house that shades it.`,
  coachCatAwake: (time: TimeOfDay) =>
    `A cat that naps ${when[time]} is still awake. Tap ${label[time]} to see why.`,
  coachCatAwakeHere: (time: TimeOfDay) =>
    `A cat that naps ${when[time]} is still awake. Give it some shade.`,
  coachSolved: 'Every cat is asleep. Switch the time to see each nap.',
  coachIdleStart: 'Drag a house from the tray onto empty ground.',
  coachIdleTip:
    'Stuck? Tap a cat to see when it naps, then switch to that time.',

  // How to play
  helpTitle: 'How to play',
  helpCats: 'Each cat needs shade at its nap time. Tap a cat to see when.',
  helpFlowers: 'Flowers need sun at all three times.',
  helpHouses: (rule: NoonRule) =>
    rule === 'one'
      ? 'Morning and evening shadows are as long as the house is tall. At noon every shadow is one tile.'
      : 'Morning and evening shadows are as long as the house is tall. At noon they are half as long.',
  helpDiagram: {
    am: 'Sun on the right, shade to the left',
    noon: 'Sun to the south, shade goes up',
    pm: 'Sun on the left, shade to the right',
  } satisfies Record<TimeOfDay, string>,
  helpBack: 'Back to the town',
  helpReplay: 'Replay the lessons',

  // Result
  asleep: (title: string) => `${title} is asleep.`,
  statTime: 'time',
  cleanNap: 'No hints',
  nextTown: (hours: number, minutes: number) =>
    hours > 0
      ? `Next town in ${hours} h ${minutes} min`
      : `Next town in ${minutes} min`,
  lookAtTown: 'Look at the town',
  notSavedLoggedOut: 'Log in to Reddit to keep your result and your streak.',
  notSavedYet:
    'Couldn’t save your result yet. It will try again when you’re back online.',
} as const;
