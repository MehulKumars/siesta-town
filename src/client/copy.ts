// Every player-facing string lives here so a human can write and edit them in one place.
// Status: agent-drafted placeholders. A human must review and sign off every line before the feature freeze.
import type { NoonRule, TimeOfDay } from '../shared/engine/types.ts';

export const copy = {
  gameName: 'Siesta',
  tagline: 'Put the town to sleep.',
  playToday: 'Play today’s town',
  seeYourTown: 'See your town',
  loading: 'Waking the town…',
  loadFailed: 'The town didn’t load. Check your connection and try again.',
  tryAgain: 'Try again',

  timeLabel: { am: 'Morning', noon: 'Noon', pm: 'Evening' } satisfies Record<
    TimeOfDay,
    string
  >,

  townNumber: (n: number, date: string) => `No. ${n}, ${date}`,
  difficulty: (level: number) => `Difficulty ${level} of 7`,
  nappedIn: (time: string) => `Napped in ${time}`,

  catNaps: {
    am: 'This cat naps in the morning.',
    noon: 'This cat naps at noon.',
    pm: 'This cat naps in the evening.',
  } satisfies Record<TimeOfDay, string>,
  flowerNeedsSun: 'Flowers need sun all day.',
  wellIsFlat: 'A well is flat: no shadow, and no room for a house.',
  spotTakenByCat: 'That spot is taken by a cat.',
  spotIsFlower: 'Houses can’t go on flowers.',
  spotIsWell: 'Houses can’t go on the well.',
  spotHasHouse: 'There’s already a house there.',

  houseInTray: (h: number) => `House, height ${h}`,
  houseOnBoard: (h: number) => `House ${h} is on the board`,
  putAllBack: 'Put all houses back',
  howToPlay: 'How to play',
  sound: 'Sound',
  backToTown: 'Back to the town',
  catsAsleep: 'Cats asleep',
  flowersInSun: 'Flowers in sun',
  timeDone: (label: string, ok: boolean) =>
    `${label} ${ok ? 'done' : 'not yet'}`,

  helpIntro:
    'Drag each house onto empty ground. Every cat must nap in shade at its time: tap a cat to see when. Flowers need sun all day.',
  helpShadows: (rule: NoonRule) =>
    rule === 'one'
      ? 'Shadows fall away from the sun: left in the morning, up at noon, right in the evening. Morning and evening shadows are as long as the house is tall. At noon every shadow is one tile.'
      : 'Shadows fall away from the sun: left in the morning, up at noon, right in the evening. Morning and evening shadows are as long as the house is tall. At noon they are half as long, rounded up.',

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
  oldTown: (n: number) =>
    `This is town No. ${n}. Today’s town is in the pinned post.`,
} as const;
