/**
 * One icon set, one geometry: 24px box, 1.5px stroke, round caps and joins.
 * Recognisable standard symbols only — no invented glyphs.
 */
export type IconName =
  | 'hand'
  | 'pen'
  | 'line'
  | 'shape'
  | 'text'
  | 'select'
  | 'eraser'
  | 'undo'
  | 'redo'
  | 'share'
  | 'download'
  | 'more'
  | 'plus'
  | 'chevron-left'
  | 'chevron-right'
  | 'trash'
  | 'duplicate'
  | 'zoom-in'
  | 'zoom-out'
  | 'fit'
  | 'close'
  | 'check'
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'heart'
  | 'note'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'italic'
  | 'underline'
  | 'connector'
  | 'arrow-start'
  | 'arrow-end'
  | 'file'
  | 'scrappy';

const PATHS: Record<IconName, string> = {
  // An open, flat palm — four fingers of similar length so it reads as "pan/
  // grab", never as a single pointing finger.
  hand: 'M7 12.5V8a1.5 1.5 0 0 1 3 0v4.5M10.3 11.7V5.7a1.5 1.5 0 0 1 3 0v6M13.6 12.2V6.7a1.5 1.5 0 0 1 3 0v5.5M16.9 13.3V9.8a1.5 1.5 0 0 1 3 0V15a6.2 6.2 0 0 1-6.2 6.2h-1.6a5.6 5.6 0 0 1-4.35-2.07l-3-3.65a1.55 1.55 0 0 1 2.4-1.96L9 15.5',
  // A single clean pencil silhouette rather than a scattered multi-stroke
  // sketch — one continuous outline reads as "pen" instantly at 20px.
  pen: 'M21.17 6.81a1 1 0 0 0-3.98-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4',
  line: 'M4.5 19.5L19.5 4.5',
  shape: 'M4 4h9v9H4zM15.5 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  select: 'M5 3l6.5 17 2.4-6.8 6.6-2.6L5 3z',
  // A single beveled block resting on a baseline — one clear "eraser" shape
  // rather than a tangle of crossing lines.
  eraser: 'M7 21l-4.3-4.3a2 2 0 0 1 0-2.8l9.6-9.6a2 2 0 0 1 2.8 0l5.6 5.6a2 2 0 0 1 0 2.8L13 21M22 21H7M5 11l9 9',
  undo: 'M4 9h10a5 5 0 0 1 0 10h-5M4 9l4-4M4 9l4 4',
  redo: 'M20 9H10a5 5 0 0 0 0 10h5M20 9l-4-4M20 9l-4 4',
  share: 'M12 15V3m0 0L8 7m4-4l4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  plus: 'M12 5v14M5 12h14',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  duplicate: 'M9 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM5 15V5a1 1 0 0 1 1-1h10M13.5 12v5M11 14.5h5',
  'zoom-in': 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M11 8v6M8 11h6',
  'zoom-out': 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6',
  fit: 'M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  rectangle: 'M4 6h16v12H4z',
  ellipse: 'M12 19a8 7 0 1 0 0-14 8 7 0 0 0 0 14z',
  triangle: 'M12 5l8 14H4l8-14z',
  star: 'M12 4l2.5 5.2 5.5.8-4 4 1 5.6-5-2.7-5 2.7 1-5.6-4-4 5.5-.8L12 4z',
  arrow: 'M4 12h13M13 7l5 5-5 5',
  heart: 'M12 20s-7-4.4-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.8C19 15.6 12 20 12 20z',
  note: 'M5 4h14v10.5L14.5 20H5V4zM19 14.5h-4.5V20',
  'align-left': 'M4 6h16M4 12h10M4 18h13',
  'align-center': 'M4 6h16M7 12h10M5.5 18h13',
  'align-right': 'M4 6h16M10 12h10M7 18h13',
  italic: 'M10 4h7M7 20h7M14.5 4l-5 16',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  connector: 'M5 6.5h4a4 4 0 0 1 4 4v3a4 4 0 0 0 4 4h2M4 4.5h2v4H4zM17 15.5h3v4h-3z',
  'arrow-start': 'M20 12H6M11 7L6 12l5 5',
  'arrow-end': 'M4 12h14M13 7l5 5-5 5',
  file: 'M13 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8l-5-5zM13 3v5h5',
  // A hand-drawn wobble, standing in for "sketchy" the way a squiggle always does.
  scrappy: 'M3 15c1.5-3 3 3 4.5 0s3-6 4.5-1 3 5 4.5 1 2-5 3.5-2',
};

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20 }: IconProps) {
  // "More" reads as three faint scratches at this size with the shared
  // stroke-path treatment — filled dots keep the system's one line weight
  // everywhere else while still giving this specific affordance the heavier,
  // unmistakable presence a "there is more here" control needs.
  if (name === 'more') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <circle cx="5.5" cy="12" r="2.1" />
        <circle cx="12" cy="12" r="2.1" />
        <circle cx="18.5" cy="12" r="2.1" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
