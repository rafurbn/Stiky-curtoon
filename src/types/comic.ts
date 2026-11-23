export type PaperTheme =
  | 'cream_sketch'
  | 'studio_white'
  | 'notebook_grid'
  | 'sunny_tint'
  | 'chalk_mint';

export type LayoutMode = '1-panel' | '2-panel' | '3-panel' | '4-panel';

export type CharacterId = 'rafu' | 'folk' | 'boss' | 'chacha' | 'friend';

export type ExpressionType =
  | 'happy'
  | 'laughing'
  | 'shocked'
  | 'angry'
  | 'deadpan'
  | 'confused'
  | 'crying'
  | 'smug'
  | 'wink';

export type PoseType =
  | 'standing'
  | 'pointing'
  | 'facepalm'
  | 'hands_up'
  | 'shrugging'
  | 'holding_phone'
  | 'holding_tea'
  | 'sitting_desk'
  | 'running';

export type PropType =
  | 'none'
  | 'tea_cup'
  | 'smartphone'
  | 'laptop'
  | 'money'
  | 'clock'
  | 'book'
  | 'heart'
  | 'sweat'
  | 'anger_vein'
  | 'question'
  | 'exclamation'
  | 'lightbulb';

export type LogoPlacement =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-banner'
  | 'watermark-center';

export type LogoStyle = 'stamp-dark' | 'comic-badge' | 'minimal-mono';

export interface ComicCharacter {
  id: CharacterId;
  name: string;
  side: 'left' | 'right' | 'center';
  expression: ExpressionType;
  pose: PoseType;
  speech?: string;
  thought?: boolean;
}

export interface ComicPanel {
  panelIndex: number;
  captionTop?: string;
  sceneProp: PropType;
  moodFx?: 'none' | 'sweat' | 'anger_vein' | 'sparkles' | 'question' | 'exclamation' | 'lightbulb';
  characters: ComicCharacter[];
}

export interface ComicScript {
  id: string;
  title: string;
  category: string;
  layout: LayoutMode;
  paperTheme: PaperTheme;
  panels: ComicPanel[];
  fbCaption: string;
  createdAt: string;
  seed: number;
}

export type PostStatus = 'draft' | 'scheduled' | 'published' | 'failed';

export interface ComicItem extends ComicScript {
  status: PostStatus;
  scheduledFor?: string;
  publishedAt?: string;
  fbPostId?: string;
  errorMessage?: string;
  publishTarget?: 'facebook_page' | 'webhook';
}

export interface BrandingConfig {
  logoText: string;
  logoPlacement: LogoPlacement;
  logoStyle: LogoStyle;
  logoOpacity: number;
  customLogoDataUrl?: string;
}

export interface AutomationSettings extends BrandingConfig {
  pageId: string;
  pageAccessToken: string;
  pageName?: string;
  webhookUrl: string;
  autoPilotEnabled: boolean;
  intervalHours: number;
  randomJitterMinutes: number;
  dailyCap: number;
  dailySlots: string[];
  timezone: string;
  useExactSlots: boolean;
  preferredCategory: string;
  languageMode: 'bangla' | 'banglish' | 'mixed';
}

export interface PublishLogEntry {
  id: string;
  comicId: string;
  title: string;
  target: 'facebook_page' | 'webhook';
  status: 'published' | 'failed';
  fbPostId?: string;
  error?: string;
  timestamp: string;
}
