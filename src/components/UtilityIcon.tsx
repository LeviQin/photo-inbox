import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import type { ColorValue } from 'react-native';

export type UtilityIconName =
  | 'search'
  | 'close'
  | 'close-circle'
  | 'chevron-back'
  | 'chevron-forward'
  | 'chevron-down'
  | 'arrow-forward'
  | 'arrow-up-right'
  | 'heart'
  | 'heart-outline'
  | 'trash'
  | 'check'
  | 'check-circle'
  | 'shield-check'
  | 'info'
  | 'help'
  | 'undo'
  | 'calendar'
  | 'gallery'
  | 'albums'
  | 'clock'
  | 'sparkles'
  | 'sliders'
  | 'scan'
  | 'database'
  | 'airplane'
  | 'utensils'
  | 'paw'
  | 'copy'
  | 'phone'
  | 'plus'
  | 'minus'
  | 'square'
  | 'checkbox'
  | 'document'
  | 'person'
  | 'text'
  | 'lock'
  | 'unlock'
  | 'alert'
  | 'heart-off';

const aliases: Record<string, UtilityIconName> = {
  search: 'search',
  'search-outline': 'search',
  close: 'close',
  'close-circle': 'close-circle',
  'chevron-back': 'chevron-back',
  back: 'chevron-back',
  'chevron-forward': 'chevron-forward',
  'chevron-down': 'chevron-down',
  'arrow-forward': 'arrow-forward',
  forward: 'arrow-forward',
  'arrow-up-outline': 'arrow-up-right',
  heart: 'heart',
  'heart-outline': 'heart-outline',
  'heart-dislike-outline': 'heart-off',
  'trash-outline': 'trash',
  'trash-bin-outline': 'trash',
  trash: 'trash',
  checkmark: 'check',
  check: 'check',
  'checkmark-circle': 'check-circle',
  'checkmark-circle-outline': 'check-circle',
  'shield-checkmark-outline': 'shield-check',
  shield: 'shield-check',
  'information-circle-outline': 'info',
  info: 'info',
  'help-circle-outline': 'help',
  help: 'help',
  'arrow-undo': 'undo',
  'arrow-undo-outline': 'undo',
  undo: 'undo',
  today: 'calendar',
  'today-outline': 'calendar',
  gallery: 'gallery',
  'albums-outline': 'albums',
  images: 'gallery',
  'images-outline': 'gallery',
  image: 'gallery',
  ellipse: 'square',
  discover: 'sparkles',
  sparkles: 'sparkles',
  'sparkles-outline': 'sparkles',
  settings: 'sliders',
  'settings-outline': 'sliders',
  'scan-outline': 'scan',
  'server-outline': 'database',
  'airplane-outline': 'airplane',
  'restaurant-outline': 'utensils',
  'paw-outline': 'paw',
  'copy-outline': 'copy',
  'phone-portrait-outline': 'phone',
  'file-tray-full-outline': 'database',
  'time-outline': 'clock',
  add: 'plus',
  remove: 'minus',
  'square-outline': 'square',
  checkbox: 'checkbox',
  'ellipse-outline': 'square',
  'document-text-outline': 'document',
  'person-outline': 'person',
  'text-outline': 'text',
  'options-outline': 'sliders',
  'lock-closed-outline': 'lock',
  'lock-open-outline': 'unlock',
  'alert-circle-outline': 'alert'
};

export function resolveUtilityIconName(name: string): UtilityIconName | null {
  return aliases[name] ?? null;
}

export function UtilityIcon({ name, size = 24, color = '#1C1C1E', strokeWidth = 1.9, active = false }: {
  name: UtilityIconName;
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
  active?: boolean;
}) {
  const common = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  let icon;

  switch (name) {
    case 'search':
      icon = <><Circle cx="10.8" cy="10.8" r="6.5" {...common} /><Line x1="15.7" y1="15.7" x2="20.3" y2="20.3" {...common} /></>;
      break;
    case 'close':
      icon = <><Line x1="6" y1="6" x2="18" y2="18" {...common} /><Line x1="18" y1="6" x2="6" y2="18" {...common} /></>;
      break;
    case 'close-circle':
      icon = <><Circle cx="12" cy="12" r="9" {...common} /><Line x1="8.8" y1="8.8" x2="15.2" y2="15.2" {...common} /><Line x1="15.2" y1="8.8" x2="8.8" y2="15.2" {...common} /></>;
      break;
    case 'chevron-back':
      icon = <Polyline points="14.5 18 8.5 12 14.5 6" {...common} />;
      break;
    case 'chevron-forward':
      icon = <Polyline points="9.5 6 15.5 12 9.5 18" {...common} />;
      break;
    case 'chevron-down':
      icon = <Polyline points="6 9.5 12 15 18 9.5" {...common} />;
      break;
    case 'arrow-forward':
      icon = <><Line x1="4.5" y1="12" x2="19" y2="12" {...common} /><Polyline points="14 7 19 12 14 17" {...common} /></>;
      break;
    case 'arrow-up-right':
      icon = <><Line x1="7" y1="17" x2="17" y2="7" {...common} /><Polyline points="10 7 17 7 17 14" {...common} /></>;
      break;
    case 'heart':
    case 'heart-outline':
      icon = <Path d="M20.2 5.8a5.1 5.1 0 0 0-7.2 0L12 6.9l-1-1.1a5.1 5.1 0 0 0-7.2 7.2L12 21l8.2-8a5.1 5.1 0 0 0 0-7.2Z" {...common} fill={name === 'heart' ? color : 'none'} />;
      break;
    case 'trash':
      icon = <><Line x1="4.5" y1="7" x2="19.5" y2="7" {...common} /><Path d="M9 7V4.8h6V7m-8.5 0 .8 13h9.4l.8-13M10 10.5v6m4-6v6" {...common} /></>;
      break;
    case 'check':
      icon = <Polyline points="5 12.5 9.4 17 19 7.5" {...common} />;
      break;
    case 'check-circle':
      icon = <><Circle cx="12" cy="12" r="9" {...common} /><Polyline points="7.8 12.3 10.7 15.2 16.5 9.2" {...common} /></>;
      break;
    case 'shield-check':
      icon = <><Path d="M12 3 19 6v5.3c0 4.5-2.8 7.8-7 9.7-4.2-1.9-7-5.2-7-9.7V6l7-3Z" {...common} /><Polyline points="8.6 12 11 14.4 15.7 9.7" {...common} /></>;
      break;
    case 'info':
      icon = <><Circle cx="12" cy="12" r="9" {...common} /><Circle cx="12" cy="8" r="1" fill={color} stroke="none" /><Line x1="12" y1="11" x2="12" y2="16.5" {...common} /></>;
      break;
    case 'help':
      icon = <><Circle cx="12" cy="12" r="9" {...common} /><Path d="M9.6 9.2a2.6 2.6 0 1 1 3.4 2.5c-.8.3-1 1-1 1.8" {...common} /><Circle cx="12" cy="17" r="1" fill={color} stroke="none" /></>;
      break;
    case 'undo':
      icon = <><Polyline points="8.5 7.5 4.5 11.5 8.5 15.5" {...common} /><Path d="M5 11.5h7.2c4.1 0 6.6 2 7.3 5.7" {...common} /></>;
      break;
    case 'calendar':
      icon = <><Rect x="3.5" y="5" width="17" height="15.5" rx="3" {...common} fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0} /><Line x1="7.5" y1="3.5" x2="7.5" y2="7" {...common} /><Line x1="16.5" y1="3.5" x2="16.5" y2="7" {...common} /><Line x1="3.8" y1="9" x2="20.2" y2="9" {...common} /><Circle cx="8" cy="13" r="1" fill={color} stroke="none" /><Circle cx="12" cy="13" r="1" fill={color} stroke="none" /><Circle cx="16" cy="13" r="1" fill={color} stroke="none" /></>;
      break;
    case 'gallery':
      icon = <><Rect x="4" y="5" width="16" height="14" rx="3" {...common} fill={active ? color : 'none'} fillOpacity={active ? 0.1 : 0} /><Circle cx="15.5" cy="9" r="1.5" {...common} /><Path d="m6.8 16 3.6-3.8 2.8 2.6 1.8-1.8 2.8 3" {...common} /></>;
      break;
    case 'albums':
      icon = <><Rect x="4" y="7" width="13.5" height="13" rx="2" {...common} /><Path d="M8 4h9.5a2 2 0 0 1 2 2v11" {...common} /><Circle cx="13.5" cy="11" r="1.25" {...common} /><Path d="m6.5 17 3-3 2.3 2 1.5-1.4 2.2 2.2" {...common} /></>;
      break;
    case 'clock':
      icon = <><Circle cx="12" cy="12" r="8.8" {...common} /><Line x1="12" y1="7.5" x2="12" y2="12" {...common} /><Line x1="12" y1="12" x2="15.5" y2="14" {...common} /></>;
      break;
    case 'sparkles':
      icon = <><Path d="M12 3.5c.7 4 2.5 5.8 6.5 6.5-4 .7-5.8 2.5-6.5 6.5-.7-4-2.5-5.8-6.5-6.5 4-.7 5.8-2.5 6.5-6.5Z" {...common} fill={active ? color : 'none'} fillOpacity={active ? 0.12 : 0} /><Path d="M18.5 3.5c.25 1.4.9 2.05 2.3 2.3-1.4.25-2.05.9-2.3 2.3-.25-1.4-.9-2.05-2.3-2.3 1.4-.25 2.05-.9 2.3-2.3ZM5.5 16.5c.3 1.65 1.05 2.4 2.7 2.7-1.65.3-2.4 1.05-2.7 2.7-.3-1.65-1.05-2.4-2.7-2.7 1.65-.3 2.4-1.05 2.7-2.7Z" {...common} /></>;
      break;
    case 'sliders':
      icon = <><Line x1="4" y1="7" x2="20" y2="7" {...common} /><Circle cx="9" cy="7" r="2" {...common} fill={active ? color : 'none'} fillOpacity={active ? 0.14 : 0} /><Line x1="4" y1="17" x2="20" y2="17" {...common} /><Circle cx="15" cy="17" r="2" {...common} fill={active ? color : 'none'} fillOpacity={active ? 0.14 : 0} /></>;
      break;
    case 'scan':
      icon = <><Path d="M8 4H5a1 1 0 0 0-1 1v3m12-4h3a1 1 0 0 1 1 1v3M8 20H5a1 1 0 0 1-1-1v-3m12 4h3a1 1 0 0 0 1-1v-3" {...common} /><Line x1="7" y1="12" x2="17" y2="12" {...common} /></>;
      break;
    case 'database':
      icon = <><Path d="M5 6c0-1.5 3.1-2.7 7-2.7s7 1.2 7 2.7-3.1 2.7-7 2.7S5 7.5 5 6Z" {...common} /><Path d="M5 6v6c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6M5 12v6c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-6" {...common} /></>;
      break;
    case 'airplane':
      icon = <Path d="m3.5 13 7.2-2.2V5.2c0-1 .6-2.2 1.3-2.2s1.3 1.2 1.3 2.2v5.6l7.2 2.2v1.7l-7.2-1v4.2l2.1 1.4V21L12 20l-3.4 1v-1.7l2.1-1.4v-4.2l-7.2 1V13Z" {...common} />;
      break;
    case 'utensils':
      icon = <><Path d="M6 3v6m3-6v6M4 3v4c0 2 1.3 3 3 3s3-1 3-3V3M7 10v11" {...common} /><Path d="M16 3v18m0-18c2.6 1.2 4 3.5 4 6.5V12h-4" {...common} /></>;
      break;
    case 'paw':
      icon = <><Circle cx="7" cy="8" r="2" {...common} /><Circle cx="12" cy="6" r="2" {...common} /><Circle cx="17" cy="8" r="2" {...common} /><Path d="M6.5 16.2c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2c0 2-1.3 3.3-3.1 3.3-.9 0-1.6-.5-2.4-.5s-1.5.5-2.4.5c-1.8 0-3.1-1.3-3.1-3.3Z" {...common} /></>;
      break;
    case 'copy':
      icon = <><Rect x="8" y="8" width="11" height="11" rx="2.2" {...common} /><Path d="M16 8V6.2C16 5 15 4 13.8 4H6.2C5 4 4 5 4 6.2v7.6C4 15 5 16 6.2 16H8" {...common} /></>;
      break;
    case 'phone':
      icon = <><Rect x="6.5" y="2.5" width="11" height="19" rx="2.5" {...common} /><Line x1="10" y1="5.5" x2="14" y2="5.5" {...common} /><Circle cx="12" cy="18.5" r="0.9" fill={color} stroke="none" /></>;
      break;
    case 'plus':
      icon = <><Line x1="12" y1="5" x2="12" y2="19" {...common} /><Line x1="5" y1="12" x2="19" y2="12" {...common} /></>;
      break;
    case 'minus':
      icon = <Line x1="5" y1="12" x2="19" y2="12" {...common} />;
      break;
    case 'square':
      icon = <Rect x="4" y="4" width="16" height="16" rx="3" {...common} />;
      break;
    case 'checkbox':
      icon = <><Rect x="4" y="4" width="16" height="16" rx="3" {...common} /><Polyline points="7.5 12 10.5 15 16.5 8.5" {...common} /></>;
      break;
    case 'document':
      icon = <><Path d="M6 3.5h9l3 3V20H6V3.5Z" {...common} /><Line x1="9" y1="11" x2="15" y2="11" {...common} /><Line x1="9" y1="15" x2="15" y2="15" {...common} /></>;
      break;
    case 'person':
      icon = <><Circle cx="12" cy="8" r="3" {...common} /><Path d="M5.5 20c.4-4 2.7-6 6.5-6s6.1 2 6.5 6" {...common} /></>;
      break;
    case 'text':
      icon = <><Line x1="4" y1="6" x2="20" y2="6" {...common} /><Line x1="4" y1="12" x2="20" y2="12" {...common} /><Line x1="4" y1="18" x2="16" y2="18" {...common} /></>;
      break;
    case 'lock':
    case 'unlock':
      icon = <><Rect x="5.5" y="10.5" width="13" height="10" rx="2" {...common} /><Path d={name === 'lock' ? 'M8 10.5V7a4 4 0 0 1 8 0v3.5' : 'M8 10.5V7a4 4 0 0 1 8 0'} {...common} /></>;
      break;
    case 'alert':
      icon = <><Circle cx="12" cy="12" r="9" {...common} /><Line x1="12" y1="7" x2="12" y2="13.5" {...common} /><Circle cx="12" cy="17" r="1" fill={color} stroke="none" /></>;
      break;
    case 'heart-off':
      icon = <><Path d="M20.2 5.8a5.1 5.1 0 0 0-7.2 0L12 6.9l-1-1.1a5.1 5.1 0 0 0-7.2 7.2L12 21l8.2-8a5.1 5.1 0 0 0 0-7.2Z" {...common} /><Line x1="4" y1="20" x2="20" y2="4" {...common} /></>;
      break;
  }

  return <Svg width={size} height={size} viewBox="0 0 24 24" focusable={false}>{icon}</Svg>;
}
