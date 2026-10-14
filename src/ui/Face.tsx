import { hashSeed } from '../sim/rng'
import type { Person } from '../sim/types'

const SKIN = ['#f6d7c3', '#eac0a2', '#d9a37f', '#bf8560', '#99643f', '#6e4429', '#4d2e1c']
const HAIR = ['#1b1714', '#2e211a', '#4a3121', '#6b4a2f', '#a07850', '#d2b07a', '#8c3b22', '#c06a3a']
const SHIRT = ['#3c4a5c', '#5a3a3a', '#2f4a3d', '#4b4058', '#665a3e', '#2a2f38', '#6b4c3b', '#3d5566']
const BG = ['#2b3442', '#3a2f2f', '#2e3a33', '#36303f', '#3d3a2c', '#253039']

/** Deterministic "random" portrait for a resident, derived from their id. */
export function Face({ p, size = 40 }: { p: Person; size?: number }) {
  let s = hashSeed(p.id + p.first + p.last)
  const r = (n: number) => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0
    return s % n
  }
  const skin = SKIN[r(SKIN.length)]
  const grey = p.age > 55 && r(10) < 6
  const hairColor = p.age > 68 ? '#d9d6cf' : grey ? '#8f8b85' : HAIR[r(HAIR.length)]
  // 0 bald, 1 short, 2 side part, 3 thin, 4 curly, 5 long, 6 shoulder, 7 buzz, 8 bun
  const STYLES = p.gender === 'male' ? [0, 1, 1, 2, 2, 3, 4, 7, 7] : p.gender === 'female' ? [5, 5, 6, 6, 8, 8, 4, 1, 2] : [0, 1, 2, 3, 4, 5, 6, 7, 8]
  const hairStyle = STYLES[r(STYLES.length)]
  const beard = p.gender === 'male' ? r(10) : 9 // 0-2 full beard, 3 moustache, 4 stubble, otherwise none
  const glasses = r(10) < 2 || (p.age > 50 && r(10) < 3)
  const shirt = SHIRT[r(SHIRT.length)]
  const bg = BG[r(BG.length)]
  const brow = r(3)
  const mouth = r(4)
  const eyeY = 31 + r(2)
  const headW = 13 + r(3)
  const wrinkles = p.age > 50

  return (
    <svg className={`face ${p.alive ? '' : 'dead'}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={`${p.first} ${p.last}`}>
      <rect width="64" height="64" fill={bg} />
      {/* long hair behind the head */}
      {(hairStyle === 5 || hairStyle === 6) && <path d={`M${32 - headW - 3} 28 Q32 6 ${32 + headW + 3} 28 L${32 + headW + 4} ${hairStyle === 5 ? 52 : 44} L${32 - headW - 4} ${hairStyle === 5 ? 52 : 44} Z`} fill={hairColor} />}
      {/* shoulders */}
      <path d="M8 64 Q10 48 32 47 Q54 48 56 64 Z" fill={shirt} />
      <path d="M26 47 L32 54 L38 47 Z" fill="rgba(0,0,0,0.25)" />
      {/* neck */}
      <rect x="27" y="40" width="10" height="9" fill={skin} />
      <rect x="27" y="40" width="10" height="3" fill="rgba(0,0,0,0.12)" />
      {/* ears */}
      <ellipse cx={32 - headW} cy="32" rx="2.5" ry="4" fill={skin} />
      <ellipse cx={32 + headW} cy="32" rx="2.5" ry="4" fill={skin} />
      {/* head */}
      <ellipse cx="32" cy="30" rx={headW} ry="15" fill={skin} />
      {/* hair on top */}
      {hairStyle === 1 && <path d={`M${32 - headW} 28 Q${32 - headW} 13 32 13 Q${32 + headW} 13 ${32 + headW} 28 Q${32 + headW - 2} 20 32 19 Q${32 - headW + 2} 20 ${32 - headW} 28 Z`} fill={hairColor} />}
      {hairStyle === 2 && <path d={`M${32 - headW - 1} 30 Q${32 - headW} 12 32 13 Q${32 + headW + 2} 13 ${32 + headW + 1} 30 Q${32 + headW} 19 36 19 Q26 22 ${32 - headW + 1} 26 Z`} fill={hairColor} />}
      {hairStyle === 3 && <path d={`M${32 - headW} 27 Q${32 - headW} 14 32 14 Q${32 + headW} 14 ${32 + headW} 27 L${32 + headW - 1} 22 Q32 18 ${32 - headW + 1} 22 Z`} fill={hairColor} opacity="0.85" />}
      {hairStyle === 4 && <g fill={hairColor}>{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={32 - headW + 1 + i * ((headW * 2 - 2) / 8)} cy={17 + Math.abs(4 - i) * 0.9} r="5" />)}</g>}
      {(hairStyle === 5 || hairStyle === 6) && <path d={`M${32 - headW - 1} 30 Q${32 - headW} 12 32 13 Q${32 + headW} 12 ${32 + headW + 1} 30 Q${32 + headW - 1} 20 32 20 Q${32 - headW + 1} 20 ${32 - headW - 1} 30 Z`} fill={hairColor} />}
      {hairStyle === 7 && <path d={`M${32 - headW} 26 Q${32 - headW} 15 32 15 Q${32 + headW} 15 ${32 + headW} 26 Q32 20 ${32 - headW} 26 Z`} fill={hairColor} />}
      {hairStyle === 8 && <><circle cx="32" cy="12" r="6" fill={hairColor} /><path d={`M${32 - headW} 27 Q${32 - headW} 14 32 14 Q${32 + headW} 14 ${32 + headW} 27 Q32 19 ${32 - headW} 27 Z`} fill={hairColor} /></>}
      {/* brows */}
      <g stroke={p.age > 68 ? '#bdb8ae' : hairStyle === 0 ? '#3a2a20' : hairColor} strokeWidth="1.6" strokeLinecap="round">
        <line x1="23" y1={eyeY - 5 + (brow === 1 ? 1 : 0)} x2="29" y2={eyeY - 5 - (brow === 2 ? 1 : 0)} />
        <line x1="35" y1={eyeY - 5 - (brow === 2 ? 1 : 0)} x2="41" y2={eyeY - 5 + (brow === 1 ? 1 : 0)} />
      </g>
      {/* eyes */}
      <circle cx="26" cy={eyeY} r="1.7" fill="#1a1412" />
      <circle cx="38" cy={eyeY} r="1.7" fill="#1a1412" />
      {wrinkles && <g stroke="rgba(0,0,0,0.25)" strokeWidth="0.7" fill="none"><path d={`M20 ${eyeY} q1 2 2 2`} /><path d={`M44 ${eyeY} q-1 2 -2 2`} /><path d="M27 21 h10" /></g>}
      {/* nose */}
      <path d={`M32 ${eyeY + 1} L30 ${eyeY + 8} Q32 ${eyeY + 9} 34 ${eyeY + 8}`} stroke="rgba(0,0,0,0.3)" strokeWidth="1" fill="none" />
      {/* facial hair */}
      {beard <= 2 && <path d={`M${32 - headW + 1} 32 Q${32 - headW + 2} 46 32 46 Q${32 + headW - 2} 46 ${32 + headW - 1} 32 Q${32 + headW - 3} 40 32 39 Q${32 - headW + 3} 40 ${32 - headW + 1} 32 Z`} fill={hairStyle === 0 && p.age < 50 ? '#3a2a20' : hairColor} />}
      {beard === 3 && <path d="M26 40 Q32 37 38 40 Q32 39 26 40 Z" stroke={hairColor} strokeWidth="2" fill={hairColor} />}
      {beard === 4 && <ellipse cx="32" cy="41" rx={headW - 3} ry="5" fill="rgba(40,30,25,0.22)" />}
      {/* mouth */}
      {mouth === 0 && <path d="M28 42 Q32 45 36 42" stroke="#5a2a24" strokeWidth="1.4" fill="none" strokeLinecap="round" />}
      {mouth === 1 && <line x1="28.5" y1="42.5" x2="35.5" y2="42.5" stroke="#5a2a24" strokeWidth="1.4" strokeLinecap="round" />}
      {mouth === 2 && <path d="M28 43.5 Q32 41.5 36 43.5" stroke="#5a2a24" strokeWidth="1.4" fill="none" strokeLinecap="round" />}
      {mouth === 3 && <path d="M28 42 Q32 46 36 42 Z" fill="#5a2a24" />}
      {/* glasses */}
      {glasses && (
        <g stroke="#111" strokeWidth="1.2" fill="rgba(200,220,255,0.12)">
          <rect x="21.5" y={eyeY - 3.5} width="9" height="7" rx="2" />
          <rect x="33.5" y={eyeY - 3.5} width="9" height="7" rx="2" />
          <line x1="30.5" y1={eyeY - 1} x2="33.5" y2={eyeY - 1} />
        </g>
      )}
      <rect width="64" height="64" fill="rgba(0,0,0,0)" stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
    </svg>
  )
}
