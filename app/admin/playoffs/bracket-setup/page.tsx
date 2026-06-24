import { redirect } from 'next/navigation';
// Superseded by the unified console; preserve old bookmarks.
export default function Page() { redirect('/pickem/admin?section=bracket-setup'); }
