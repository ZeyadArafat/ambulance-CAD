const colors = {
  AVAILABLE:
    'text-[#22C55E] border-[#22C55E]/30 bg-[#22C55E]/10',

  'EN ROUTE':
    'text-[#38BDF8] border-[#38BDF8]/30 bg-[#38BDF8]/10',

  'ON SCENE':
    'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10',

  TRANSPORTING:
    'text-[#A78BFA] border-[#A78BFA]/30 bg-[#A78BFA]/10',

  'AT HOSPITAL':
    'text-[#60A5FA] border-[#60A5FA]/30 bg-[#60A5FA]/10',

  'OUT OF SERVICE':
    'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10',

  Dispatched:
    'text-[#38BDF8] border-[#38BDF8]/30 bg-[#38BDF8]/10',

  Pending:
    'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10',

  'IN SERVICE':
    'text-[#22C55E] border-[#22C55E]/30 bg-[#22C55E]/10',

  MAINTENANCE:
    'text-[#A78BFA] border-[#A78BFA]/30 bg-[#A78BFA]/10',

  WARNING:
    'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10',

  CRITICAL:
    'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10',
}

export default function StatusBadge({ status }) {
  const colorClass =
    colors[status] ||
    'text-[#AAB4C3] border-[#222B3A] bg-[#0F141D]'

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] font-bold tracking-wide ${colorClass}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}