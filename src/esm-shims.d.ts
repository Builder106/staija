declare module 'https://esm.sh/motion-v@1.7.1' {
  export const Motion: import('vue').Component;
}

declare module 'https://esm.sh/lottie-web@5.12.2' {
  export interface AnimationItem {
    play(): void;
    stop(): void;
    pause(): void;
    destroy(): void;
    goToAndStop(value: number, isFrame?: boolean): void;
    goToAndPlay(value: number, isFrame?: boolean): void;
    setSpeed(speed: number): void;
    setDirection(direction: 1 | -1): void;
  }

  export type LottieAnimationData = Record<string, string | number | boolean | null | undefined | object>;

  const lottie: {
    loadAnimation(params: {
      container: HTMLElement;
      renderer: string;
      loop: boolean;
      autoplay: boolean;
      animationData: LottieAnimationData;
    }): AnimationItem;
  };
  export default lottie;
}
