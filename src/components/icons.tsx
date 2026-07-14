import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></IconBase>;
}

export function FileIcon(props: IconProps) {
  return <IconBase {...props}><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></IconBase>;
}

export function SparkIcon(props: IconProps) {
  return <IconBase {...props}><path d="m12 3 1.1 3.3a4 4 0 0 0 2.6 2.6L19 10l-3.3 1.1a4 4 0 0 0-2.6 2.6L12 17l-1.1-3.3a4 4 0 0 0-2.6-2.6L5 10l3.3-1.1a4 4 0 0 0 2.6-2.6L12 3Z"/><path d="m18.5 16 .5 1.5a2 2 0 0 0 1.5 1.5l-1.5.5a2 2 0 0 0-1.5 1.5l-.5-1.5a2 2 0 0 0-1.5-1.5l1.5-.5a2 2 0 0 0 1.5-1.5Z"/></IconBase>;
}

export function CopyIcon(props: IconProps) {
  return <IconBase {...props}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></IconBase>;
}

export function DownloadIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></IconBase>;
}

export function CheckIcon(props: IconProps) {
  return <IconBase {...props}><path d="m5 12 4 4L19 6"/></IconBase>;
}

export function XIcon(props: IconProps) {
  return <IconBase {...props}><path d="m7 7 10 10M17 7 7 17"/></IconBase>;
}
