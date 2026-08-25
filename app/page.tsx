import StarMapApp from '@/components/StarMapApp';

// StarMapApp is a client component; all browser-only work (Telegram SDK,
// d3-celestial, canvas) happens in effects/handlers, so it is SSR-safe to
// render here without a dynamic ssr:false wrapper.
export default function Page() {
  return <StarMapApp />;
}
