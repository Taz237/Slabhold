import { Composition } from "remotion";
import { Promo, DURATION, FPS } from "./Promo";

export const RemotionRoot = () => (
  <Composition id="Promo" component={Promo} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
);
