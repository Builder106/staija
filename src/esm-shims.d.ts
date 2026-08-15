declare module 'https://esm.sh/motion-v@1.7.1' {
  export const Motion: import('vue').Component;
}

declare module 'https://esm.sh/lottie-web@5.12.2' {
  const lottie: {
    loadAnimation(params: {
      container: HTMLElement;
      renderer: string;
      loop: boolean;
      autoplay: boolean;
      animationData: Record<string, unknown>;
    }): unknown;
  };
  export default lottie;
}
