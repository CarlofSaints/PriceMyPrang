import Image from "next/image";

type Variant = "primary-light" | "horizontal-light" | "horizontal-dark" | "icon";

const SRC: Record<Variant, { src: string; w: number; h: number }> = {
  "primary-light": { src: "/brand/png/lockup-primary-light.png", w: 940, h: 690 },
  "horizontal-light": { src: "/brand/png/lockup-horizontal-light.png", w: 1200, h: 420 },
  "horizontal-dark": { src: "/brand/png/lockup-horizontal-dark.png", w: 1200, h: 420 },
  icon: { src: "/brand/svg/icon-fullcolour.svg", w: 120, h: 120 },
};

export function Logo({
  variant = "horizontal-light",
  className,
  priority,
}: {
  variant?: Variant;
  className?: string;
  priority?: boolean;
}) {
  const { src, w, h } = SRC[variant];
  return (
    <Image
      src={src}
      width={w}
      height={h}
      alt="Price my Prang"
      className={className}
      priority={priority}
    />
  );
}
