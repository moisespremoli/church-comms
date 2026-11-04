import { Field, Select, TextInput } from "@/components/ui/field";
import { CHANNEL_COLORS, CHANNEL_ICON_OPTIONS } from "@/lib/channels";

type Defaults = {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  is_emergency?: boolean;
  has_voice_room?: boolean;
};

export function ChannelFields({ idPrefix, defaults = {} }: { idPrefix: string; defaults?: Defaults }) {
  return (
    <>
      <Field label="Nome" htmlFor={`${idPrefix}-name`}>
        <TextInput id={`${idPrefix}-name`} name="name" required maxLength={60} defaultValue={defaults.name} />
      </Field>
      <Field label="Descrição" htmlFor={`${idPrefix}-description`}>
        <TextInput id={`${idPrefix}-description`} name="description" maxLength={280} defaultValue={defaults.description} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ícone" htmlFor={`${idPrefix}-icon`}>
          <Select id={`${idPrefix}-icon`} name="icon" defaultValue={defaults.icon ?? "hash"}>
            {CHANNEL_ICON_OPTIONS.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cor" htmlFor={`${idPrefix}-color`}>
          <Select id={`${idPrefix}-color`} name="color" defaultValue={defaults.color ?? "slate"}>
            {Object.entries(CHANNEL_COLORS).map(([value, tokens]) => (
              <option key={value} value={value}>
                {tokens.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input type="checkbox" name="is_emergency" defaultChecked={defaults.is_emergency} className="size-5 accent-red-400" />
        Canal de emergências
      </label>
      <label className="flex min-h-10 items-center gap-3 text-sm">
        <input type="checkbox" name="has_voice_room" defaultChecked={defaults.has_voice_room} className="size-5 accent-sky-400" />
        Sala de áudio associada <span className="text-ink-faint">(ativa na Fase 3)</span>
      </label>
    </>
  );
}
