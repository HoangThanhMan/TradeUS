import { redirect } from 'next/navigation';

export default function Home() {
  // Server-side redirect to the auth page so the app starts at the login screen
  redirect('/auth');
}
