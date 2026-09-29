import { BenefitsSection } from '../modules/landing/benefits-section';
import { CtaSection } from '../modules/landing/cta-section';
import { HeroSection } from '../modules/landing/hero-section';

export default function HomePage() {
  return (
    <div className="grid gap-20 pb-10">
      <HeroSection />
      <BenefitsSection />
      <CtaSection />
    </div>
  );
}
