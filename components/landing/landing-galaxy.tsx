/**
 * Signed-out Home's backdrop: a slow purple mesh fixed behind the page, with
 * a faint grain. Drawn on the server and moved by CSS alone (.lg-galaxy in
 * app/landing.css): four soft lights drift on a 40s loop, and hold still for
 * readers who asked for less motion. Decoration only.
 */
export function LandingGalaxy() {
  return (
    <div aria-hidden className="lg-galaxy" data-landing-galaxy="">
      <div className="lg-galaxy-mesh">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="lg-galaxy-grain" />
    </div>
  );
}
