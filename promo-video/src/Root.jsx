import { Composition } from "remotion";
import { Promo, DURATION, FPS } from "./Promo.jsx";
export const RemotionRoot = () => (<Composition id="Promo" component={Promo} durationInFrames={DURATION} fps={FPS} width={1080} height={1920}/>);
