import { createClient } from "@/lib/supabase/server";
import { LandingNav } from "./_landing/landing-nav";
import { Hero } from "./_landing/hero";
import { Features } from "./_landing/features";
import { Compliance } from "./_landing/compliance";
import { Pricing } from "./_landing/pricing";
import { CtaFooter } from "./_landing/cta-footer";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAuthed = Boolean(user);

  return (
    <div className="min-h-screen">
      <LandingNav isAuthed={isAuthed} />
      <main>
        <Hero isAuthed={isAuthed} />
        <Features />
        <Compliance />
        <Pricing isAuthed={isAuthed} />
        <CtaFooter isAuthed={isAuthed} />
      </main>
    </div>
  );
}
