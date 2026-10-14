export const MALE_NAMES = [
  'Aaron', 'Adrian', 'Amir', 'Ben', 'Carl', 'Colin', 'Daniel', 'Diego', 'Eli', 'Ethan', 'Felix', 'Hector', 'Ian', 'Jack',
  'Jamal', 'Jonah', 'Kofi', 'Leo', 'Marco', 'Mark', 'Nate', 'Omar', 'Owen', 'Rahul', 'Sean', 'Theo', 'Tom', 'Victor',
  'Wes', 'Yusuf',
]

export const FEMALE_NAMES = [
  'Abby', 'Alice', 'Ana', 'Bianca', 'Carmen', 'Chloe', 'Elena', 'Emma', 'Farah', 'Grace', 'Hana', 'Iris', 'Jade', 'Kara',
  'Laila', 'Lucy', 'Maya', 'Mia', 'Nadia', 'Nina', 'Priya', 'Rosa', 'Ruth', 'Sara', 'Sofia', 'Uma', 'Vera', 'Yara', 'Zoe',
]

/** Names used by anyone. */
export const NEUTRAL_NAMES = ['Alex', 'Dana', 'Dev', 'Jin', 'Quinn', 'Sam', 'Robin', 'Jordan', 'Riley', 'Ash']

export const FIRST_NAMES = [...MALE_NAMES, ...FEMALE_NAMES, ...NEUTRAL_NAMES]

export type Gender = 'male' | 'female' | 'nonbinary'

export function nameFor(g: Gender, roll: number): string {
  const pool = g === 'male' ? MALE_NAMES : g === 'female' ? FEMALE_NAMES : NEUTRAL_NAMES
  return pool[Math.floor(roll * pool.length)]
}

/** Best guess for a name from before genders existed. */
export const genderOfName = (name: string): Gender | undefined =>
  MALE_NAMES.includes(name) ? 'male' : FEMALE_NAMES.includes(name) ? 'female' : undefined

export const LAST_NAMES = [
  'Abbott', 'Alvarez', 'Bakker', 'Bennett', 'Brooks', 'Carter', 'Chen', 'Costa', 'Dahl', 'Diaz', 'Ellis', 'Fischer',
  'Foster', 'Garcia', 'Grant', 'Hale', 'Hughes', 'Ibrahim', 'Jensen', 'Kaur', 'Kim', 'Kowalski', 'Lambert', 'Lopez',
  'Mason', 'Mendez', 'Moreau', 'Murphy', 'Nakamura', 'Novak', 'Okafor', 'Olsen', 'Patel', 'Perez', 'Quinn', 'Reyes',
  'Rossi', 'Santos', 'Schmidt', 'Shaw', 'Silva', 'Singh', 'Sullivan', 'Tanaka', 'Turner', 'Vance', 'Walsh', 'Weber',
  'Wright', 'Young', 'Zhang',
]

export const CITY_PREFIX = ['Ash', 'Cold', 'Elm', 'Grey', 'Hollow', 'Iron', 'Mill', 'North', 'Red', 'Silver', 'Stone', 'Wills']
export const CITY_SUFFIX = ['brook', 'field', 'ford', 'haven', 'mere', 'port', 'ridge', 'ton', 'vale', 'wick']

export const DISTRICT_NAMES = [
  'Downtown', 'Old Town', 'Riverside', 'Eastgate', 'Northfield', 'Harbor', 'Industrial Park', 'Westend', 'Hillcrest', 'The Flats',
]

export const STREETS = [
  'Elm St', 'Oak Ave', 'Maple Rd', '5th St', 'Harbor Way', 'Mill Ln', 'Canal St', 'Birch Ave', 'King St', 'Station Rd',
  'Rose Ln', 'Quarry Rd', 'Ferry St', 'Market St', 'Chapel Rd', 'Pine St', 'Union Ave', 'Bridge St',
]

export const BAR_NAMES = ['The Anchor', 'Low Tide', 'The Copper Pot', 'Night Owl', "Rusty's", 'The Lantern', 'Blue Door']
export const RESTAURANT_NAMES = ['Lucky Noodle', 'Mama Rosa', 'Grill House', 'Corner Diner', 'Saffron', 'Pier 9 Fish']
export const COMPANY_NAMES = ['Northline Insurance', 'Vexa Software', 'Halden Logistics', 'Brightwell Bank', 'Orbis Media', 'Kestrel Law']
export const FACTORY_NAMES = ['Mercer Steelworks', 'Delta Packaging', 'Coldfield Bottling', 'Arden Textiles']
export const PARK_NAMES = ['Memorial Park', 'Willow Green', 'Founders Square', 'Riverside Walk']
export const LAKE_NAMES = ['Black Lake', 'Miller Pond', 'The Reservoir', 'Grey River Bend']
export const FOREST_NAMES = ['Hollow Woods', 'Pine Ridge Forest', 'Old Quarry Woods']
