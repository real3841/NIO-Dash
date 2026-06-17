import type { EnvFieldDef } from "../lib/env-config";

interface Props {
  fields: EnvFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}

export function EnvConfigForm({ fields, values, onChange, disabled }: Props) {
  return (
    <div className="env-form-grid">
      {fields.map((field) => (
        <label
          key={field.key}
          className={field.type === "textarea" || field.hint ? "env-field-span2" : undefined}
        >
          {field.label}
          {field.hint && <span className="env-field-hint">{field.hint}</span>}
          {field.type === "textarea" ? (
            <textarea
              rows={field.key.includes("MOBILEINFO") ? 4 : 2}
              value={values[field.key] ?? ""}
              disabled={disabled}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          ) : (
            <input
              type={field.type === "password" ? "password" : "text"}
              value={values[field.key] ?? ""}
              disabled={disabled}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}
        </label>
      ))}
    </div>
  );
}
