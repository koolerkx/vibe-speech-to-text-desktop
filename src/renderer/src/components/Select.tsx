import type { ReactNode } from 'react';
import type { SelectOption } from '../../../shared/settings';

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
}): ReactNode {
  return (
    <select
      className="rounded-md border border-white/10 bg-gray-800 px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
