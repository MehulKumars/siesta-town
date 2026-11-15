// The inline splash in the feed: taps only, no drag, no scrolling. Static HTML paints first; the town fills in after.
import './theme.css';
import './splash.css';
import { requestExpandedMode } from '@devvit/web/client';
import { longDate } from '../shared/dates.ts';
import { drawTownPreview } from './art.ts';
import { copy } from './copy.ts';
import { fetchInit } from './net.ts';

function byId<T extends Element>(
  id: string,
  kind: { new (): T; prototype: T }
): T {
  const node = document.getElementById(id);
  if (!(node instanceof kind)) throw new Error(`Missing #${id}`);
  return node;
}

const play = byId('play', HTMLButtonElement);
play.textContent = copy.playToday;
byId('status', HTMLParagraphElement).textContent = copy.tagline;

// Expanded mode must be requested synchronously inside the trusted click.
play.addEventListener('click', (event) => {
  try {
    requestExpandedMode(event, 'game');
  } catch (error) {
    console.error('Could not open the game', error);
  }
});

function formatTime(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function fill(): Promise<void> {
  try {
    const init = await fetchInit();
    const { town } = init;
    byId('town-title', HTMLHeadingElement).textContent = town.title;
    byId('town-date', HTMLParagraphElement).textContent = init.isToday
      ? copy.townNumber(town.number, longDate(town.date))
      : copy.oldTown(town.number);
    drawTownPreview(byId('preview', SVGSVGElement), town.puzzle);
    const level = byId('level', HTMLDivElement);
    level.replaceChildren();
    level.setAttribute('aria-label', copy.difficulty(town.level));
    level.removeAttribute('aria-hidden');
    for (let i = 1; i <= 7; i++) {
      const dot = document.createElement('span');
      if (i <= town.level) dot.className = 'on';
      level.appendChild(dot);
    }
    if (init.result) {
      byId('status', HTMLParagraphElement).textContent = copy.nappedIn(
        formatTime(init.result.timeMs)
      );
      play.textContent = copy.seeYourTown;
    }
  } catch {
    // The button still opens the game, which shows its own error and a retry.
  }
}

void fill();
