import Image from "next/image";
import { imageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

const sizes = {
  sm: [32, "size-8 text-xs"],
  md: [40, "size-10 text-sm"],
  lg: [56, "size-14 text-lg"],
  xl: [80, "size-20 text-2xl"],
  "2xl": [128, "size-24 text-3xl sm:size-32 sm:text-4xl"],
} as const;

type Props = {
  path?: string | null;
  name: string;
  size?: keyof typeof sizes;
  // Decorative images sit next to the visible name, so they stay silent for screen readers.
  decorative?: boolean;
  className?: string;
};

function Picture({
  path,
  name,
  size = "md",
  decorative = true,
  className,
  initials,
}: Props & {
  initials: string;
}) {
  const url = imageUrl(path);
  const [pixels, classes] = sizes[size];
  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden border bg-muted font-semibold text-muted-foreground",
        classes,
        className,
      )}
    >
      {url ? (
        <Image
          src={url}
          alt={decorative ? "" : name}
          width={pixels}
          height={pixels}
          className="size-full object-cover"
          unoptimized
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}

export function ProductLogo(props: Props) {
  return (
    <Picture
      {...props}
      initials={props.name.trim().charAt(0).toUpperCase()}
      className={cn("rounded-[22%]", props.className)}
    />
  );
}

export function PersonAvatar(props: Props) {
  const initials = props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return <Picture {...props} initials={initials} className={cn("rounded-full", props.className)} />;
}
