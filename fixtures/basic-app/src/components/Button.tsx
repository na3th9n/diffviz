import { formatLabel } from "../utils/format.js";

export function Button({ label, className }: { label: string; className?: string }) {
  return <button className={className}>{formatLabel(label)}</button>;
}
