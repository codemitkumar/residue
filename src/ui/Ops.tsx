import { useState } from 'react'
import { useGame } from './state'
import { Badge, Field, Flash, Panel, TimePicker, TrafficStrip } from './widgets'
import { DISPOSAL_KINDS, disposalFor, expectedWhereabouts, killTime, schedule, validateOperation } from '../sim/actions'
import { ITEMS, SHOP_ITEMS, isHomeItem } from '../sim/items'
import { hoursLabel, isOpen, travelMinutes } from '../sim/geo'
import { TROPHY_LABEL, rentStorage, storageLocations } from '../sim/underworld'
import { patrolAt, presenceLabel, roadblockIn } from '../sim/patrol'
import { HOUR, fmtClock, fmtDuration, fmtTime, hourOf, inBlock, nextOccurrence } from '../sim/time'
import { districtName, fullName, loc, nameOf, playerPerson } from '../sim/world'
import type { ItemId, OperationPlan } from '../sim/types'

export function Plan() {
  const { w, act, focus, go } = useGame()
  const inv = w.player.inventory
  const has = (i: ItemId) => (inv[i] ?? 0) > 0
  const [op, setOp] = useState<OperationPlan>(() => ({
    targetId: focus.personId ?? '', locationId: '', at: nextOccurrence(w.time, 23), weapon: has('knife') ? 'knife' : has('rope') ? 'rope' : 'hands',
    disposalLocationId: 'none', disposal: 'leave', victimPhone: 'destroyed', bringOwnPhone: true, vehicle: 'car',
    gloves: has('gloves'), mask: has('mask'), bleach: false, tarp: has('tarp'), lure: 'none',
  }))
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof OperationPlan>(k: K, v: OperationPlan[K]) => setOp((o) => ({ ...o, [k]: v }))

  const target = w.people.find((p) => p.id === op.targetId)
  const L = op.locationId ? loc(w, op.locationId) : undefined
  const D = op.disposalLocationId !== 'none' ? loc(w, op.disposalLocationId) : undefined
  const lIntel = L ? w.player.locIntel[L.id] : undefined
  const h = hourOf(op.at)
  const expected = target ? expectedWhereabouts(w, target, op.at) : null
  const me = playerPerson(w)
  const time = killTime(w, op, op.at)
  const shiftClash = w.player.employed && me.shift && (inBlock(op.at, me.shift) || inBlock(op.at + time.total, me.shift))
  const errors = op.targetId && op.locationId ? validateOperation(w, op) : []
  const living = w.people.filter((p) => p.alive && !p.isPlayer && w.player.known?.[p.id]).sort((a, b) => a.last.localeCompare(b.last))
  const places = w.locations.filter((l) => l.kind !== 'police')
  const dumps = w.locations.filter((l) => DISPOSAL_KINDS.includes(l.kind))

  const extra = (k: 'sedate' | 'stolenPlates' | 'cleaner', item: ItemId, label: string) =>
    has(item) ? (
      <label className="check">
        <input type="checkbox" checked={!!op[k]} onChange={(e) => set(k, e.target.checked)} />
        <span>{label}</span>
      </label>
    ) : null
  const check = (k: 'gloves' | 'mask' | 'bleach' | 'tarp', item: ItemId, label: string) => (
    <label className={`check ${has(item) ? '' : 'disabled'}`}>
      <input type="checkbox" disabled={!has(item)} checked={op[k]} onChange={(e) => set(k, e.target.checked)} />
      <span>{label} {!has(item) && <span className="muted">(not owned)</span>}</span>
    </label>
  )

  return (
    <div className="grid two">
      <Panel title="Plan a kill" tag="NO SECOND CHANCES">
        <div className="stack plan-form">
          <fieldset className="plan-step">
            <legend><b>1</b> Who, where, when</legend>
            <Field label="Target">
              <select value={op.targetId} onChange={(e) => set('targetId', e.target.value)}>
                <option value="">— choose —</option>
                {living.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
              </select>
            </Field>
            <Field label="Where">
              <select value={op.locationId} onChange={(e) => set('locationId', e.target.value)}>
                <option value="">— choose —</option>
                {w.districts.map((d) => (
                  <optgroup key={d.id} label={d.name}>
                    {places.filter((l) => l.districtId === d.id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </Field>
            <Field label="When"><TimePicker now={w.time} value={op.at} onChange={(t) => set('at', t)} /></Field>
            <Field label="How to get them there">
              <select value={op.lure} onChange={(e) => set('lure', e.target.value as OperationPlan['lure'])}>
                <option value="none">Wait for them (rely on their routine)</option>
                <option value="own_phone">Call them from your phone and arrange to meet</option>
                <option value="burner" disabled={!has('burner') && !has('clean_burner')}>Call from a burner {has('burner') || has('clean_burner') ? '' : '(not owned)'}</option>
              </select>
            </Field>
          </fieldset>

          <fieldset className="plan-step">
            <legend><b>2</b> The act</legend>
            <Field label="Method">
              <select value={op.weapon} onChange={(e) => set('weapon', e.target.value as OperationPlan['weapon'])}>
                <option value="knife" disabled={!has('knife')}>Knife {has('knife') ? '' : '(not owned)'}</option>
                <option value="rope" disabled={!has('rope')}>Rope {has('rope') ? '' : '(not owned)'}</option>
                <option value="hands">Bare hands</option>
                <option value="pistol" disabled={!has('pistol')}>Pistol {has('pistol') ? '' : '(not owned)'}</option>
              </select>
            </Field>
            <div className="row wrap">
              <Field label="Their wallet">
                <select value={op.wallet ?? 'leave'} onChange={(e) => set('wallet', e.target.value as OperationPlan['wallet'])}>
                  <option value="leave">Leave it</option>
                  <option value="cash">Take the cash</option>
                  <option value="cards">Take the cash and their bank card</option>
                </select>
              </Field>
              <Field label="Take a trophy">
                <select value={op.trophy ?? 'none'} onChange={(e) => set('trophy', e.target.value as OperationPlan['trophy'])}>
                  <option value="none">Nothing</option>
                  <option value="jewelry">A piece of their jewellery</option>
                  <option value="hair">A lock of their hair</option>
                  <option value="id">Their ID card</option>
                  <option value="photo">A photo of them</option>
                </select>
              </Field>
            </div>
            {extra('sedate', 'sedative', 'Use the sedative')}
          </fieldset>

          <fieldset className="plan-step">
            <legend><b>3</b> The body</legend>
            <div className="row wrap">
              <Field label="Body">
                <select value={op.disposalLocationId} onChange={(e) => set('disposalLocationId', e.target.value)}>
                  <option value="none">Leave it where it falls</option>
                  {dumps.map((l) => <option key={l.id} value={l.id}>{l.name} ({districtName(w, l.districtId)})</option>)}
                </select>
              </Field>
              <Field label="Their phone">
                <select value={op.victimPhone} onChange={(e) => set('victimPhone', e.target.value as OperationPlan['victimPhone'])}>
                  <option value="destroyed">Smash it at the scene</option>
                  <option value="left">Leave it on the body</option>
                  <option value="kept">Keep it</option>
                </select>
              </Field>
            </div>
            {(w.player.keepsakes ?? []).length > 0 && (
              <Field label="Leave behind">
                <select value={op.plant ?? ''} onChange={(e) => set('plant', e.target.value || undefined)}>
                  <option value="">Nothing</option>
                  {(w.player.keepsakes ?? []).map((k) => <option key={k.id} value={k.id}>{nameOf(w, k.personId)}'s {k.item}</option>)}
                </select>
              </Field>
            )}
            <div className="check-grid">
              {check('tarp', 'tarp', 'Wrap in tarp')}
              {check('bleach', 'bleach', 'Clean up with bleach')}
              {extra('cleaner', 'fixer', 'Call the Cleaner for the body')}
            </div>
          </fieldset>

          <fieldset className="plan-step">
            <legend><b>4</b> Covering yourself</legend>
            <Field label="Transport">
              <select value={op.vehicle} onChange={(e) => set('vehicle', e.target.value as OperationPlan['vehicle'])}>
                <option value="car">Your car</option>
                <option value="rental">Rent a car ($90)</option>
                <option value="foot">On foot</option>
              </select>
            </Field>
            <div className="check-grid">
              <label className="check">
                <input type="checkbox" checked={op.bringOwnPhone} onChange={(e) => set('bringOwnPhone', e.target.checked)} />
                <span>Take your phone with you</span>
              </label>
              {check('gloves', 'gloves', 'Wear gloves')}
              {check('mask', 'mask', 'Wear the balaclava')}
              {extra('stolenPlates', 'stolen_plates', 'Swap on the stolen plates')}
            </div>
          </fieldset>
          <Flash msg={err} />
          <button
            className="danger big"
            disabled={!op.targetId || !op.locationId || errors.length > 0}
            onClick={() => {
              const e = act((w) => schedule(w, { kind: 'operation', op: { ...op, at: Math.max(w.time, op.at) } }, Math.max(w.time, op.at)))
              setErr(e)
              if (!e) go('dashboard')
            }}
          >
            Commit to the plan
          </button>
        </div>
      </Panel>

      <div className="plan-aside">
      <Panel title="What you know">
        <div className="stack">
          <div>
            <h4>Target</h4>
            {!target ? <p className="muted">No target chosen.</p> : (
              <p>
                {op.lure !== 'none'
                  ? `You'll call ${target.first} and ask to meet.`
                  : expected
                    ? <>Their routine puts them at <b>{expected}</b> at {fmtTime(op.at)}. {L && expected !== L.name && <Badge tone="red">not where you'll be</Badge>}</>
                    : <>You don't know their routine. <a onClick={() => go('people', { personId: target.id })}>Tail them first.</a></>}
              </p>
            )}
          </div>
          <div>
            <h4>Scene</h4>
            {L && (
              <p className="small">
                👮 {presenceLabel(patrolAt(w, L, op.at))}
                {roadblockIn(w, L.districtId, op.at) && <> · <Badge tone="red">Roadblock in {districtName(w, L.districtId)}</Badge></>}
                {D && D.districtId !== L.districtId && roadblockIn(w, D.districtId, op.at) && <> · <Badge tone="red">Roadblock in {districtName(w, D.districtId)}</Badge></>}
              </p>
            )}
            {L && (
              <p className="muted small">
                {travelMinutes(w, me.homeId, L.id, op.vehicle === 'foot')} min {op.vehicle === 'foot' ? 'walk' : 'drive'} from home
                {hoursLabel(L.kind) ? ` · open ${hoursLabel(L.kind)}` : ''}
              </p>
            )}
            {!L ? <p className="muted">No location chosen.</p> : !lIntel?.scouts ? (
              <p><Badge tone="amber">Never scouted</Badge> Cameras, guards and passers-by are all unknown.</p>
            ) : (
              <>
                <p>{lIntel.knownCameras.length} camera(s) spotted{lIntel.guardKnown ? ', security guard on site' : ''}. {lIntel.traffic[h] === undefined ? `You haven't watched it at ${String(h).padStart(2, '0')}:00.` : `At ${String(h).padStart(2, '0')}:00 it's ${lIntel.traffic[h] < 0.1 ? 'quiet' : lIntel.traffic[h] < 0.35 ? 'got some people around' : 'busy'}.`}</p>
                <TrafficStrip traffic={lIntel.traffic} highlight={h} />
              </>
            )}
          </div>
          <div>
            <h4>Disposal</h4>
            {op.cleaner ? <p>The Cleaner takes it away.</p> : !D ? <p>Body stays at the scene.</p> : (
              <p>{disposalFor(w, D, op.at + 60).text}. {!w.player.locIntel[D.id]?.scouts && <Badge tone="amber">never scouted</Badge>}</p>
            )}
          </div>
          {L && (
            <div>
              <h4>How long it takes · {fmtDuration(time.total)}</h4>
              <ul className="tight small">
                {time.parts.map((p) => <li key={p.label}>{p.label} — {p.min} min</li>)}
              </ul>
              <p className="muted small">On site {fmtClock(op.at)} → {fmtClock(op.at + time.total)}, plus the drive there and back.</p>
            </div>
          )}
          {shiftClash && <p className="muted">You have a shift at work around then.</p>}
          {errors.length > 0 && <div className="flash err">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
        </div>
      </Panel>
      </div>
    </div>
  )
}

export function Shop() {
  const { w, act } = useGame()
  const [basket, setBasket] = useState<Record<string, ItemId[]>>({})
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  const [when, setWhen] = useState(w.time)
  const home = playerPerson(w).homeId
  const stores = w.locations.filter((l) => ['hardware', 'pharmacy', 'grocery'].includes(l.kind))
  const add = (store: string, i: ItemId) => setBasket((b) => ({ ...b, [store]: [...(b[store] ?? []), i] }))
  const remove = (store: string, idx: number) => setBasket((b) => ({ ...b, [store]: (b[store] ?? []).filter((_, k) => k !== idx) }))

  return (
    <div className="stack">
      <Panel title={`Shop · $${w.player.money}`} tag="BASKET">
        <div className="row between wrap">
          <p className="muted">Fill a basket, then go. A trip takes 30 minutes in the store, plus the drive there and back.</p>
          <div className="row">
            <span className="muted small">Go</span>
            <select value={when === w.time ? 'now' : 'later'} onChange={(e) => setWhen(e.target.value === 'now' ? w.time : w.time + HOUR)}>
              <option value="now">as soon as possible</option>
              <option value="later">at a set time…</option>
            </select>
            {when !== w.time && <TimePicker now={w.time} value={when} onChange={setWhen} />}
          </div>
        </div>
        <p className="small">Food at home: <b>{w.player.food ?? 0} day(s)</b></p>
        <Flash msg={msg.err} ok={msg.ok} />
      </Panel>
      <div className="grid three">
        {stores.map((s) => {
          const items = basket[s.id] ?? []
          const total = items.reduce((sum, i) => sum + ITEMS[i].price, 0)
          const open = isOpen(s.kind, w.time)
          const checkout = (cash: boolean) => {
            const err = act((w) => schedule(w, { kind: 'shop', locationId: s.id, items, cash }, Math.max(w.time, when)))
            setMsg({ err, ok: err ? undefined : `Heading to ${s.name}.` })
            if (!err) setBasket((b) => ({ ...b, [s.id]: [] }))
          }
          return (
            <Panel key={s.id} title={s.name}>
              <p className="muted small">{districtName(w, s.districtId)} · {hoursLabel(s.kind)} · {open ? <Badge tone="green">open</Badge> : <Badge>closed</Badge>} · {travelMinutes(w, home, s.id)} min away</p>
              <table>
                <tbody>
                  {SHOP_ITEMS.filter((i) => ITEMS[i].sold.includes(s.kind)).sort((a, b) => Number(isHomeItem(b)) - Number(isHomeItem(a))).map((i) => (
                    <tr key={i}>
                      <td>
                        <b>{ITEMS[i].name}</b> <span className="muted">${ITEMS[i].price}</span>
                        <div className="hint">{ITEMS[i].desc}</div>
                      </td>
                      <td className="nowrap"><button className="ghost small" onClick={() => add(s.id, i)}>+ add</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 0 && (
                <div className="basket">
                  <div>{items.map((i, k) => <span key={k} className="chip-item" onClick={() => remove(s.id, k)} title="Remove">{ITEMS[i].name} ✕</span>)}</div>
                  <div className="row between">
                    <b>${total}</b>
                    <div className="row">
                      <button className="small" onClick={() => checkout(false)}>Pay card</button>
                      <button className="small" onClick={() => checkout(true)}>Pay cash</button>
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

export function Inventory() {
  const { w, act } = useGame()
  const inv = w.player.inventory
  const dumps = w.locations.filter((l) => ['lake', 'forest', 'alley', 'construction'].includes(l.kind))
  const [dumpAt, setDumpAt] = useState(dumps[0]?.id ?? '')
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  const items = (Object.keys(inv) as ItemId[]).filter((i) => (inv[i] ?? 0) > 0)

  return (
    <div className="stack">
      <Panel title="Your stuff">
        {items.length === 0 ? <p className="muted">Nothing. Visit the shop.</p> : (
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i}>
                  <td><b>{ITEMS[i].name}</b></td>
                  <td>{inv[i]}</td>
                  <td>{w.player.tainted[i]?.length ? <Badge tone="red">traces of {w.player.tainted[i]!.map((v) => nameOf(w, v)).join(', ')}</Badge> : <span className="muted">{ITEMS[i].desc}</span>}</td>
                  <td>
                    <button className="ghost small" onClick={() => {
                      const err = act((w) => schedule(w, { kind: 'dispose_item', item: i, locationId: dumpAt }, w.time))
                      setMsg({ err, ok: err ? undefined : `Getting rid of ${ITEMS[i].name}.` })
                    }}>Get rid of it</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Field label="Dump things at">
          <select value={dumpAt} onChange={(e) => setDumpAt(e.target.value)}>
            {dumps.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Flash msg={msg.err} ok={msg.ok} />
      </Panel>
      <StolenCards />
      <Keepsakes />
      <Trophies />
      <Panel title="Your car">
        <div className="row between">
          <span>{w.player.carTraces.length ? <Badge tone="red">There may be blood in the car</Badge> : 'Clean, as far as you know.'}</span>
          <button onClick={() => {
            const err = act((w) => schedule(w, { kind: 'clean_car' }, w.time))
            setMsg({ err, ok: err ? undefined : 'Cleaning the car.' })
          }}>Scrub with bleach (2h)</button>
        </div>
      </Panel>
    </div>
  )
}

function Trophies() {
  const { w, act } = useGame()
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  const run = (fn: () => string | null, ok: string) => {
    const err = act(fn)
    setMsg({ err, ok: err ? undefined : ok })
  }
  const tr = w.player.trophies ?? []
  const st = w.player.storage
  const unit = storageLocations(w)[0]
  const hasFake = (w.player.inventory.fake_id_cheap ?? 0) + (w.player.inventory.fake_id_good ?? 0) > 0
  return (
    <Panel title="Trophies" tag={`${w.victims.length} KILL${w.victims.length === 1 ? '' : 'S'}`}>
      {tr.length === 0 ? <p className="muted">Nothing kept. Nothing to find.</p> : (
        <ul className="agenda">
          {tr.map((t) => (
            <li key={t.id}>
              <span>{TROPHY_LABEL[t.kind]} — <b>{nameOf(w, t.victimId)}</b></span>
              <Badge tone={t.where === 'home' ? 'red' : 'muted'}>{t.where === 'home' ? 'at home' : 'storage'}</Badge>
            </li>
          ))}
        </ul>
      )}
      <h4>Storage unit</h4>
      {st ? (
        <div className="stack-sm">
          <p>Unit #{st.unit} at {loc(w, st.locationId).name} — rented under {st.alias === 'real' ? 'your own name' : 'a false name'}.</p>
          <div className="row wrap">
            <button className="small" onClick={() => run(() => schedule(w, { kind: 'storage_trip', locationId: st.locationId, move: 'stash' }, w.time), 'On your way to the unit.')}>Move trophies to the unit</button>
            <button className="small ghost" onClick={() => run(() => schedule(w, { kind: 'storage_trip', locationId: st.locationId, move: 'retrieve' }, w.time), 'On your way to the unit.')}>Bring them home</button>
          </div>
        </div>
      ) : unit ? (
        <div className="row wrap">
          <span className="muted small">{unit.name} · $80/month, two months up front</span>
          <button className="small" onClick={() => run(() => rentStorage(w, unit.id, 'real'), 'Unit rented.')}>Rent in my name</button>
          <button className="small" disabled={!hasFake} onClick={() => run(() => rentStorage(w, unit.id, 'fake'), 'Unit rented.')}>Rent with a fake ID{hasFake ? '' : ' (none)'}</button>
        </div>
      ) : null}
      <Flash msg={msg.err} ok={msg.ok} />
    </Panel>
  )
}

function Keepsakes() {
  const { w } = useGame()
  const ks = w.player.keepsakes ?? []
  if (!ks.length) return null
  return (
    <Panel title="Sealed bags" tag="SOMEONE ELSE'S DNA">
      <ul className="agenda">
        {ks.map((k) => (
          <li key={k.id}>
            <span><b>{nameOf(w, k.personId)}</b> — {k.what}</span>
            <span className="muted small">{fmtTime(k.at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function StolenCards() {
  const { w, act } = useGame()
  const cards = w.player.stolenCards ?? []
  const atms = w.locations.filter((l) => l.kind === 'grocery' || l.kind === 'gas' || l.kind === 'pharmacy')
  const [where, setWhere] = useState(atms[0]?.id ?? '')
  const [msg, setMsg] = useState<{ err: string | null; ok?: string }>({ err: null })
  if (!cards.length) return null
  return (
    <Panel title="Bank cards" tag="NOT YOURS">
      <ul className="agenda">
        {cards.map((c) => (
          <li key={c.victimId}>
            <span>{nameOf(w, c.victimId)}'s card <span className="muted small">· used {c.uses}×</span></span>
            <button className="small danger" onClick={() => {
              const err = act((w) => schedule(w, { kind: 'atm', locationId: where, victimId: c.victimId }, w.time))
              setMsg({ err, ok: err ? undefined : 'Heading to the ATM.' })
            }}>Withdraw cash</button>
          </li>
        ))}
      </ul>
      <Field label="ATM at">
        <select value={where} onChange={(e) => setWhere(e.target.value)}>
          {atms.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>
      <Flash msg={msg.err} ok={msg.ok} />
    </Panel>
  )
}
