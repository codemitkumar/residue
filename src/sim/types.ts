import type { RngState } from './rng'

/** Absolute game time in minutes since Day 0, 00:00. */
export type Minute = number

export type LocationKind =
  | 'house'
  | 'apartment'
  | 'office'
  | 'factory'
  | 'bar'
  | 'restaurant'
  | 'hardware'
  | 'pharmacy'
  | 'grocery'
  | 'gym'
  | 'hospital'
  | 'park'
  | 'construction'
  | 'lake'
  | 'forest'
  | 'warehouse'
  | 'alley'
  | 'parking'
  | 'police'
  | 'gas'
  | 'storage'
  | 'school'

export interface District {
  id: string
  name: string
}

export interface Camera {
  id: string
  /** Chance an event at the location is captured clearly. */
  coverage: number
  /** Hard to spot while scouting. */
  hidden: boolean
  retentionDays: number
  /** Spray-painted / broken until this time. */
  disabledUntil?: Minute
}

export interface Location {
  id: string
  name: string
  kind: LocationKind
  districtId: string
  cameras: Camera[]
  /** Foot traffic per hour 0..23, 0..1. */
  traffic: number[]
  /** How well lit at night, 0..1. */
  lighting: number
  guard: boolean
  /** Construction sites: day the foundation is poured (sealed afterwards). */
  pourDay?: number
}

export type RelationType = 'partner' | 'family' | 'friend' | 'coworker' | 'boss'

export interface Relation {
  personId: string
  type: RelationType
  /** 0..1 — drives call frequency and how quickly they notice an absence. */
  closeness: number
}

export type Trait = 'night_owl' | 'loner' | 'social' | 'fit' | 'paranoid' | 'nosy'

export interface Shift {
  start: number // hour, may exceed 24 for overnight shifts
  end: number
  days: number[] // 0..6
}

export interface Habit {
  locationId: string
  start: number // hour, may exceed 24
  end: number
  days: number[]
}

export type Gender = 'male' | 'female' | 'nonbinary'

export interface Person {
  id: string
  gender: Gender
  first: string
  last: string
  age: number
  job: string
  workplaceId?: string
  shift?: Shift
  pay: number
  homeId: string
  phone: string
  traits: Trait[]
  habit?: Habit
  relations: Relation[]
  /** Cash in their wallet. */
  cash?: number
  /** Money in the bank (what a stolen card can reach). */
  savings?: number
  alive: boolean
  isPlayer: boolean
  /** Born in-game (or backdated for children): age follows from it. */
  bornAt?: Minute
  /** A baby on the way, due then. */
  expecting?: Minute
}

export interface CallRecord {
  id: string
  from: string // personId
  to: string
  time: Minute
  answered: boolean
  durationMin: number
  /** District of the caller's cell tower. */
  towerDistrictId: string
  burner?: boolean
}

export type EvidenceKind =
  | 'cctv'
  | 'witness'
  | 'fingerprint'
  | 'dna'
  | 'phone_ping'
  | 'tower_dump'
  | 'call_log'
  | 'purchase'
  | 'weapon'
  | 'search_find'
  | 'statement'
  | 'alibi'
  | 'absence'
  | 'bank'
  | 'footprint'

/** How police can uncover a given piece of evidence. */
export type Discovery = 'cctv_pull' | 'canvass' | 'forensics' | 'phone_records' | 'tower_dump' | 'purchase_check' | 'search' | 'employer' | 'bank_records'

export interface Evidence {
  id: string
  kind: EvidenceKind
  via: Discovery
  time: Minute
  locationId?: string
  districtId?: string
  victimId?: string
  /** Who this evidence implicates (may be innocent). */
  pointsTo?: string
  strength: number
  /** Prints/DNA only implicate once the suspect's samples are on file. */
  needsSample?: boolean
  item?: ItemId
  description: string
  expiresAt?: Minute
  discovered: boolean
  discoveredAt?: Minute
  caseId?: string
  /** Put there by the player to frame someone (truth only). */
  planted?: { keepsakeId: string; noticed: boolean }
}

export type ItemId =
  | 'gloves'
  | 'knife'
  | 'rope'
  | 'bleach'
  | 'shovel'
  | 'tarp'
  | 'weights'
  | 'mask'
  | 'burner'
  | 'scanner'
  | 'victim_phone'
  | 'groceries'
  | 'flowers'
  | 'wine'
  | 'cleaner'
  | 'spray'
  | 'fake_id_cheap'
  | 'fake_id_good'
  | 'clean_burner'
  | 'stolen_plates'
  | 'sedative'
  | 'pistol'
  | 'fixer'

export type Weapon = 'knife' | 'rope' | 'hands' | 'pistol'

export type TrophyKind = 'none' | 'jewelry' | 'hair' | 'id' | 'photo'

export interface Trophy {
  id: string
  victimId: string
  kind: Exclude<TrophyKind, 'none'>
  where: 'home' | 'storage'
  takenAt: Minute
}

export type DisposalMethod = 'leave' | 'dump' | 'bury' | 'sink' | 'hide' | 'foundation' | 'cleaned'

export interface Victim {
  personId: string
  killedAt: Minute
  killLocationId: string
  bodyLocationId: string
  disposal: DisposalMethod
  weapon: Weapon
  phone: 'left' | 'destroyed' | 'kept'
  /** Whether the player carried their own phone during the kill. */
  playerPhone?: boolean
  /** Concealment 0..1 — how hard the body is to find on a deliberate search. */
  concealment: number
  reportedAt?: Minute
  reportAt?: Minute
  reporterId?: string
  /** How worried each acquaintance is (>= 1 files a missing-person report). */
  worry: Record<string, number>
  foundAt?: Minute
  caseId?: string
}

export type CaseType = 'missing' | 'homicide' | 'assault'

export type TaskKind =
  | 'bank_records'
  | 'employer_check'
  | 'interview'
  | 'phone_records'
  | 'canvass'
  | 'cctv_pull'
  | 'search_area'
  | 'autopsy'
  | 'forensics'
  | 'tower_dump'
  | 'purchase_check'
  | 'question'
  | 'search_warrant'
  | 'arrest'
  | 'go_cold'

export interface PoliceTask {
  id: string
  kind: TaskKind
  dueAt: Minute
  locationId?: string
  districtId?: string
  personId?: string
  /** Time window centre for footage / tower pulls. */
  around?: Minute
  windowMin?: number
}

export interface CaseLog {
  time: Minute
  text: string
  /** Visible to the player via the police scanner. */
  scanner?: string
}

export interface Case {
  id: string
  victimId: string
  type: CaseType
  openedAt: Minute
  status: 'open' | 'cold' | 'closed'
  log: CaseLog[]
  tasks: PoliceTask[]
  done: string[] // dedupe keys for tasks already queued
  suspicion: Record<string, number>
  /** The victim was a child: everything the police have goes into it. */
  child?: boolean
  /** Someone else was charged and the case closed on them. */
  charged?: string
  chargedAt?: Minute
  /** Police best estimate of time of death. */
  todEstimate?: { from: Minute; to: Minute }
  lastKnownLocationId?: string
  lastProgress: Minute
}

export interface NewsItem {
  id: string
  time: Minute
  headline: string
  body: string
  kind: 'news' | 'personal' | 'scanner' | 'system'
}

export interface LocationIntel {
  scouts: number
  knownCameras: string[]
  traffic: Record<number, number>
  guardKnown?: boolean
  pourDayKnown?: boolean
}

export interface PersonIntel {
  researched?: boolean
  tailed?: boolean
  knowsShift?: boolean
  knowsHabit?: boolean
  knowsHome?: boolean
  knowsLivesAlone?: boolean
}

export type Activity =
  | { kind: 'scout'; locationId: string }
  | { kind: 'visit'; locationId: string }
  | { kind: 'research'; personId: string }
  | { kind: 'tail'; personId: string }
  | { kind: 'lift'; personId: string }
  | { kind: 'shop'; locationId: string; items: ItemId[]; cash: boolean }
  | { kind: 'tamper'; locationId: string }
  | { kind: 'refuel'; locationId: string }
  | { kind: 'service_car'; locationId: string }
  | { kind: 'atm'; locationId: string; victimId: string }
  | { kind: 'storage_trip'; locationId: string; move: 'stash' | 'retrieve' }
  | { kind: 'deal'; locationId: string; item: ItemId; price: number }
  | { kind: 'dispose_item'; item: ItemId; locationId: string }
  | { kind: 'clean_car' }
  | { kind: 'interview'; appId: string; locationId: string }
  | { kind: 'obligation'; obligation: Obligation }
  | { kind: 'operation'; op: OperationPlan }

export interface ScheduledActivity {
  id: string
  activity: Activity
  label: string
  /** Leaves home (travel) — the agenda slot really starts here. */
  departAt: Minute
  startAt: Minute
  endAt: Minute
  /** Back home — the slot ends here. */
  returnAt: Minute
  /** Drove your own car there. */
  drive?: boolean
  started: boolean
  done?: boolean
  /** Put there by life (an obligation); cancelling it means skipping it. */
  fixed?: boolean
  /** What the player learns when the activity finishes. */
  report?: { headline: string; body: string }
}

export interface OperationPlan {
  targetId: string
  locationId: string
  /** Absolute start time. */
  at: Minute
  weapon: Weapon
  /** 'none' leaves the body at the scene. */
  disposalLocationId: string | 'none'
  disposal: DisposalMethod
  victimPhone: 'left' | 'destroyed' | 'kept'
  bringOwnPhone: boolean
  vehicle: 'car' | 'rental' | 'foot'
  gloves: boolean
  mask: boolean
  bleach: boolean
  tarp: boolean
  lure: 'none' | 'own_phone' | 'burner'
  /** A blackout: the urge took over. Sloppy by definition. */
  frenzy?: boolean
  /** What you do with their wallet. */
  wallet?: 'leave' | 'cash' | 'cards'
  /** What you do if a patrol turns up mid-job. */
  ifPolice?: 'run' | 'hide' | 'surrender'
  /** Nobody involved will call the police (a fight with a dealer). */
  quiet?: boolean
  trophy?: TrophyKind
  sedate?: boolean
  stolenPlates?: boolean
  /** Hand the body to a black-market cleaner instead of disposing of it yourself. */
  cleaner?: boolean
  /** Keepsake id: leave someone else's DNA at the scene. */
  plant?: string
}

/** Something carrying another person's DNA, taken to frame them. */
export interface Keepsake {
  id: string
  personId: string
  /** "the glass they drank from" */
  what: string
  /** "glass" */
  item: string
  at: Minute
  /** They saw you take it. */
  noticed: boolean
}

export interface PlayerState {
  personId: string
  money: number
  inventory: Partial<Record<ItemId, number>>
  /** Items used in a kill that still carry trace evidence. */
  tainted: Partial<Record<ItemId, string[]>>
  /** Planned activities, sorted by start time and never overlapping. */
  agenda: ScheduledActivity[]
  missedShifts: number
  employed: boolean
  questioned: boolean
  searched: boolean
  samplesOnFile: boolean
  /** Victims whose blood is in the player's car (transported without a tarp). */
  carTraces: string[]
  /** Hurt (by a dealer, a fight): weaker and bleeding until then. */
  injuredUntil?: Minute
  /** Your black-market contact (a real person, standing in an alley every night). */
  dealerId?: string
  /** No contact until then (the last one is dead or done with you). */
  marketClosedUntil?: Minute
  /** Money owed to the black market. */
  streetDebt?: { amount: number; dueAt: Minute; stage: number }
  /** 0..1 — the need to kill. Hits 1 and you lose control. */
  urge?: number
  bills?: Bill[]
  loans?: Loan[]
  /** 300..850 */
  credit?: number
  autopay?: boolean
  car?: Car
  /** Child of the player, once there is one. */
  childId?: string
  babyDue?: Minute
  trophies?: Trophy[]
  keepsakes?: Keepsake[]
  /** The false identity on your fake ID, once you have one. */
  alias?: { first: string; last: string; age: number; quality: 'cheap' | 'good'; since: Minute }
  /** Rented storage unit, and whose name is on the contract. */
  storage?: { locationId: string; alias: 'real' | 'fake'; unit: number }
  /** Day the account last went into overdraft (fees are weekly). */
  overdraftSince?: number
  /** Days of food at home. */
  food?: number
  /** Per-day work record. */
  shifts: Record<number, 'paid' | 'missed' | 'sick'>
  /** Fixed weekly salary of the current job. */
  salary?: number
  bossId?: string
  /** Shifts missed or taken sick since the last payday (docked from pay). */
  unpaidShifts?: number
  /** Shifts scheduled since the last payday. */
  shiftsDue?: number
  firedCount?: number
  applications?: Application[]
  romance?: Romance
  /** Arrested and waiting for trial (in a cell, or out on bail). */
  custody?: {
    since: Minute
    charge: string
    /** Evidence weight on top of the case files (e.g. caught in the act). */
    extra: number
    caseId?: string
    inCustody: boolean
    trialAt: Minute
    bail?: number
    bailPosted: boolean
    lawyer?: 'public' | 'standard' | 'elite'
    missedCourt?: boolean
  }
  acquitted?: number
  /** Bank cards taken from victims. */
  stolenCards?: { victimId: string; balance: number; uses: number }[]
  /** A patrol caught you mid-job. Decide before the deadline or you're arrested. */
  encounter?: {
    at: Minute
    deadline: Minute
    locationId: string
    caseId?: string
    victimId: string
    phase: 'struggle' | 'after'
    mask: boolean
    vehicle: 'car' | 'rental' | 'foot'
    stolenPlates?: boolean
  }
  /** When each kind of obligation last came up (cooldowns). */
  lifeLog?: Record<string, Minute>
  locIntel: Record<string, LocationIntel>
  personIntel: Record<string, PersonIntel>
  /** People the player has met or heard of, and how. Only these show up in the People view. */
  known: Record<string, { how: string; at: Minute }>
  messages: Message[]
  /** Name of the detective who contacts the player. */
  detective?: string
}

export interface JobListing {
  id: string
  workplaceId: string
  title: string
  shift: Shift
  /** Weekly salary. */
  salary: number
  /** Base chance of being hired. */
  odds: number
  postedAt: Minute
  expiresAt: Minute
}

export interface Application {
  id: string
  listing: JobListing
  status: 'applied' | 'interview' | 'interviewed' | 'hired' | 'rejected'
  appliedAt: Minute
  /** When the employer responds next. */
  replyAt: Minute
  interviewAt?: Minute
}

export interface Choice {
  id: string
  label: string
}

export type MessageAction =
  | { kind: 'invite'; locationId: string; at: Minute }
  | { kind: 'alibi'; caseId: string; about: Minute }
  | { kind: 'interview'; appId: string; at: Minute }
  | { kind: 'spouse' }
  | { kind: 'smalltalk' }

export type ObligationType = 'family_dinner' | 'birthday' | 'doctor' | 'landlord' | 'overtime' | 'date' | 'wedding' | 'night_feed' | 'pediatrician' | 'court'

export type BillKind = 'rent' | 'utilities' | 'phone' | 'insurance' | 'childcare' | 'loan' | 'repair' | 'storage' | 'medical'

export interface Bill {
  id: string
  kind: BillKind
  label: string
  amount: number
  dueAt: Minute
  paidAt?: Minute
  late?: boolean
  /** Escalation already sent (eviction notice / collections). */
  warned?: boolean
}

export interface Loan {
  id: string
  principal: number
  balance: number
  weekly: number
  takenAt: Minute
}

export interface Car {
  plate: string
  /** 0..100 */
  fuel: number
  /** 0..100 */
  condition: number
  inShopUntil?: Minute
}

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'heat'

export interface Weather {
  day: number
  kind: WeatherKind
  temp: number
}

export type EventKind = 'holiday' | 'festival' | 'masks' | 'fireworks' | 'marathon' | 'concert'

export interface CityEvent {
  id: string
  kind: EventKind
  name: string
  day: number
  districtId?: string
  locationId?: string
}

export interface Obligation {
  type: ObligationType
  title: string
  locationId: string
  withPersonId?: string
}

export interface Romance {
  personId: string
  status: 'asked' | 'dating' | 'engaged' | 'married'
  /** 0..1 — how much they love you. */
  affection: number
  /** 0..1 — how much they suspect something is off (spouse only). */
  suspicion: number
  since: Minute
  replyAt?: Minute
  /** The spouse noticed you were out last night and will ask about it. */
  noticedNightOut?: boolean
}

export interface Message {
  id: string
  /** personId, or 'police' / 'work'. */
  thread: string
  from: 'them' | 'me'
  text: string
  time: Minute
  read: boolean
  /** Arrived as a phone call rather than a text. */
  call?: boolean
  choices?: Choice[]
  answered?: string
  expiresAt?: Minute
  action?: MessageAction
}

export interface GameOver {
  at: Minute
  reason: string
  /** Arrested, or walked into a police station. */
  kind?: 'arrested' | 'surrendered' | 'convicted'
  /** Convicted with children among the victims. */
  childKiller?: boolean
}

export interface World {
  version: 1
  seed: string
  rng: RngState
  cityName: string
  time: Minute
  districts: District[]
  locations: Location[]
  people: Person[]
  player: PlayerState
  calls: CallRecord[]
  evidence: Evidence[]
  victims: Victim[]
  cases: Case[]
  news: NewsItem[]
  counter: number
  /** 0..1 — public fury after a child is taken. Floods the streets with police. */
  outrage?: number
  /** When the player's last killing spree was noticed. */
  spreeNoticedAt?: Minute
  /** Children and schools have been added to this world. */
  families?: boolean
  /** People (other than the player) whose prints and DNA police have on file. */
  samples?: string[]
  /** Police have linked multiple deaths. */
  taskForce?: boolean
  /** What the press calls the killer once deaths are linked. */
  killerName?: string
  /** Extra patrols per district after a body turns up. */
  patrolHeat?: Record<string, { level: number; since: Minute; until: Minute }>
  roadblocks?: { districtId: string; from: Minute; until: Minute; caseId: string }[]
  /** Today plus a short forecast. */
  weather?: Weather[]
  events?: CityEvent[]
  jobListings?: JobListing[]
  gameOver?: GameOver
  /** Set when something happened that should pause the clock. */
  pauseRequested?: boolean
}
