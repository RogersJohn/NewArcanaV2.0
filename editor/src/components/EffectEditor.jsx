import React from 'react';
import { ACTION_TYPES, TOME_ONPLAY_TYPES, SUITS } from '../utils/defaults.js';
import { ACTION_EFFECTS, TOME_ONPLAY, CELESTIAL } from '../utils/tooltips.js';
import Tooltip, { Label } from './Tooltip.jsx';
import BonusEditor from './BonusEditor.jsx';

export default function EffectEditor({ category, effect, onChange }) {
  if (category === 'action') return <ActionEffect effect={effect} onChange={onChange} />;
  if (category === 'tome') return <TomeEffect effect={effect} onChange={onChange} />;
  if (category === 'celestial') return <CelestialEffect effect={effect} onChange={onChange} />;
  if (category === 'bonus-round') return <BonusRoundEffect effect={effect} onChange={onChange} />;
  return null;
}

function ActionEffect({ effect, onChange }) {
  const isGameEnd = effect.type === 'game_end_trigger';

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isGameEnd}
          onChange={e => {
            if (e.target.checked) {
              onChange({ type: 'game_end_trigger', trigger: 'death_revealed' });
            } else {
              onChange({ type: 'action', action: ACTION_TYPES[0] });
            }
          }}
          className="rounded"
        />
        Game-end trigger (e.g. Death)
        <Tooltip text={ACTION_EFFECTS.gameEndTrigger} />
      </label>

      {isGameEnd ? (
        <Label text="Trigger" tooltip="The trigger identifier. 'death_revealed' ends the game when this card appears.">
          <input
            type="text"
            value={effect.trigger || ''}
            onChange={e => onChange({ ...effect, trigger: e.target.value })}
            className="input"
          />
        </Label>
      ) : (
        <Label text="Action" tooltip={ACTION_EFFECTS[effect.action] || 'Select an action type to see its description.'}>
          <select
            value={effect.action || ''}
            onChange={e => onChange({ ...effect, type: 'action', action: e.target.value })}
            className="input"
          >
            {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Label>
      )}
    </div>
  );
}

function TomeEffect({ effect, onChange }) {
  const onPlayAction = effect.onPlay?.action || null;

  return (
    <div className="space-y-3">
      <Label text="On-Play Action" tooltip={onPlayAction ? TOME_ONPLAY[onPlayAction] : 'Optional effect that triggers when this card is played to Tome.'}>
        <select
          value={onPlayAction || ''}
          onChange={e => {
            const val = e.target.value || null;
            if (!val) {
              onChange({ ...effect, onPlay: null });
            } else {
              const onPlay = { action: val };
              if (val === 'PROTECT_SUIT') onPlay.suit = effect.onPlay?.suit || 'CUPS';
              if (val === 'DRAW_TO_LIMIT') onPlay.limit = effect.onPlay?.limit || 7;
              onChange({ ...effect, onPlay });
            }
          }}
          className="input"
        >
          <option value="">None</option>
          {TOME_ONPLAY_TYPES.filter(Boolean).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </Label>

      {onPlayAction === 'PROTECT_SUIT' && (
        <Label text="Protected Suit" tooltip={TOME_ONPLAY.protectedSuit}>
          <select
            value={effect.onPlay?.suit || 'CUPS'}
            onChange={e => onChange({ ...effect, onPlay: { ...effect.onPlay, suit: e.target.value } })}
            className="input"
          >
            {SUITS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Label>
      )}

      {onPlayAction === 'DRAW_TO_LIMIT' && (
        <Label text="Draw Limit" tooltip={TOME_ONPLAY.drawLimit}>
          <input
            type="number"
            value={effect.onPlay?.limit ?? 7}
            onChange={e => onChange({ ...effect, onPlay: { ...effect.onPlay, limit: Number(e.target.value) } })}
            className="input"
          />
        </Label>
      )}

      <div className="border-t border-gray-700 pt-3">
        <p className="text-sm text-gray-400 mb-2">Bonus (round-end)</p>
        <BonusEditor
          bonus={effect.bonus}
          onChange={bonus => onChange({ ...effect, bonus })}
        />
      </div>
    </div>
  );
}

function CelestialEffect({ effect, onChange }) {
  return (
    <div className="space-y-3">
      <Label text="VP at Game End" tooltip={CELESTIAL.vpAtGameEnd}>
        <input
          type="number"
          value={effect.vpAtGameEnd ?? 2}
          onChange={e => onChange({ ...effect, type: 'celestial', vpAtGameEnd: Number(e.target.value) })}
          className="input"
        />
      </Label>
      <Label text="Win Condition Group" tooltip={CELESTIAL.winConditionGroup}>
        <input
          type="text"
          value={effect.winConditionGroup || 'celestial'}
          onChange={e => onChange({ ...effect, type: 'celestial', winConditionGroup: e.target.value })}
          className="input"
        />
      </Label>
    </div>
  );
}

function BonusRoundEffect({ effect, onChange }) {
  return (
    <div className="space-y-3">
      <BonusEditor
        bonus={effect.bonus}
        onChange={bonus => onChange({ ...effect, type: 'bonus', bonus })}
      />
    </div>
  );
}
