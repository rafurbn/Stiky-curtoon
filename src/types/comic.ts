export type PaperTheme =
  | 'cream_sketch'
  | 'studio_white'
  | 'notebook_grid'
  | 'sunny_tint'
  | 'chalk_mint';

export type LayoutMode = '1-panel' | '2-panel' | '3-panel' | '4-panel';

export type CharacterId = 'rafu' | 'folk' | 'boss' | 'chacha' | 'friend' | (string & {});

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
  moodFx?:
    | 'none'
    | 'sweat'
    | 'anger_vein'
    | 'sparkles'
    | 'question'
    | 'exclamation'
    | 'lightbulb';
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

export type VideoRenderStyle = 'stick_meme' | 'cartoon_2d';

export type VideoTheme =
  | 'clear_day_sky'
  | 'village_road'
  | 'bazar_street'
  | 'river_ghat'
  | 'field_meadow'
  | 'tea_stall_day'
  | 'bathroom_rush'
  | 'room_door'
  | 'bedroom_night'
  | 'exam_hall'
  | 'rain_storm'
  | 'desert_sun'
  | 'office_drama'
  | 'tea_stall'
  | 'street_night'
  | (string & {});

export type VideoAspectRatio = '9:16' | '1:1';

export type VideoCamera =
  | 'wide'
  | 'zoom_left'
  | 'zoom_right'
  | 'zoom_center'
  | 'shake';

export type VideoAction =
  | 'idle'
  | 'walk_in'
  | 'laugh'
  | 'point_laugh'
  | 'panting'
  | 'shocked_jump'
  | 'eye_pop'
  | 'facepalm'
  | 'hands_up'
  | 'pour_water'
  | 'sip_tea'
  | 'run'
  | 'knock_door'
  | 'desperate_squeeze'
  | 'scream_jaw'
  | 'door_peek'
  | 'collapsed_mess'
  | 'dramatic_closeup'
  | 'charge_butt'
  | (string & {});

export type VideoProp =
  | 'none'
  | 'door_closed'
  | 'door_open'
  | 'toilet_squat'
  | 'splat_mess'
  | 'umbrella_normal'
  | 'umbrella_upside_down'
  | 'broken_umbrella'
  | 'water_tap_glass'
  | 'tea_cup'
  | 'smartphone'
  | 'money'
  | 'laptop'
  | 'clock'
  | (string & {});

export type VideoSfx =
  | 'none'
  | 'knock_door'
  | 'dramatic_boom'
  | 'scream_sting'
  | 'door_creak'
  | 'splat_funny'
  | 'laugh'
  | 'gasp'
  | 'thunder'
  | 'pour'
  | 'punchline'
  | 'pop'
  | 'sad_trombone';

export type VideoMusicStyle =
  | 'comedy'
  | 'quirky'
  | 'dramatic'
  | 'cinematic_parody'
  | 'none';

export type VideoVoiceEngine = 'auto' | 'edge_tts' | 'gemini_tts' | 'none';

export type VoiceEffectPreset =
  | 'normal'
  | 'panicked'
  | 'dramatic_boss'
  | 'cartoon_high';

export type VideoStoryArc = 'quick_short' | 'viral_story';

export type VideoSubtitleStyle = 'reels_bold' | 'comic_bubble' | 'meme_clean';

export interface VideoVoiceClip {
  sceneIndex: number;
  charIndex: number;
  characterId: CharacterId;
  characterName: string;
  text: string;
  audioDataUrl: string;
  durationSec: number;
  offsetInSceneSec: number;
  provider: 'edge_tts' | 'gemini_tts' | 'custom_upload';
}

export type HeldPropType =
  | 'none'
  | 'smartphone'
  | 'tea_cup'
  | 'money'
  | 'stick'
  | 'umbrella'
  | 'football'
  | 'bucket'
  | 'book';

export interface ArmPoseDeg {
  shoulder: number;
  elbow: number;
}

export interface LegPoseDeg {
  hip: number;
  knee: number;
}

export interface CharacterKeyframe {
  t: number; // 0..1 normalized within scene
  x: number; // 0..1 horizontal position (can go -0.3..1.3 for entry/fly-out)
  y: number; // 0 = ground, >0 = airborne jump/fly, <0 = crouched/fallen
  facing?: 1 | -1;
  rotationDeg?: number; // full body rotation (e.g. 0 -> 1080 for rolling like a ball)
  curlBall?: number; // 0..1 tuck into rolling ball
  torsoLeanDeg?: number; // -45..45 lean in facing direction
  headTiltDeg?: number; // -35..35 head tilt
  leftArmDeg?: ArmPoseDeg;
  rightArmDeg?: ArmPoseDeg;
  leftLegDeg?: LegPoseDeg;
  rightLegDeg?: LegPoseDeg;
  vibrate?: number; // 0..1 tickle/laugh/panic shiver
  scale?: number; // 0.6..1.5
  heldProp?: HeldPropType;
  expression?: ExpressionType | 'exhausted';
  spriteFrame?: number; // optional explicit sprite frame index (0..frameCount-1)
}

export type SceneVisualEffectType =
  | 'impact_star'
  | 'speed_lines'
  | 'tickle_sparks'
  | 'dust_puff'
  | 'sweat_burst'
  | 'laugh_burst'
  | 'screen_shake';

export interface SceneVisualEffect {
  t: number; // 0..1
  duration?: number; // 0.1..0.7
  type: SceneVisualEffectType;
  x: number; // 0..1
  y: number; // 0..1
  text?: string;
  targetCharIndex?: number; // anchors visual FX directly onto target character
}

export interface SceneSfxCue {
  t: number; // 0..1
  sfx: VideoSfx;
}

export type CharacterKind = 'human_rig' | 'sprite_actor';

export type OutfitStyle =
  | 'casual'
  | 'lungi_panjabi'
  | 'farmer'
  | 'office_suit'
  | 'student'
  | 'shopkeeper'
  | 'police';

export interface VideoCharacterState {
  id: CharacterId;
  name: string;
  side: 'left' | 'right' | 'center';
  expression: ExpressionType | 'exhausted';
  action: VideoAction;
  prop: VideoProp;
  speech?: string;
  voiceEffect?: VoiceEffectPreset;
  customAudioDataUrl?: string;
  keyframes?: CharacterKeyframe[];
  kind?: CharacterKind;
  spriteAssetId?: string;
  outfitStyle?: OutfitStyle;
  inlineSvg?: string;
}

export interface VideoScene {
  sceneIndex: number;
  durationSec: number;
  theme: VideoTheme;
  backgroundAssetId?: string;
  backgroundInlineSvg?: string;
  camera: VideoCamera;
  sfx: VideoSfx;
  captionTop?: string;
  splitScreen?: boolean;
  characters: VideoCharacterState[];
  effects?: SceneVisualEffect[];
  sfxCues?: SceneSfxCue[];
}

export type HybridAssetCategory = 'background' | 'sprite_actor' | 'prop';
export type HybridAssetFormat = 'svg' | 'svg_spritesheet' | 'png_spritesheet' | 'png';

export interface HybridAssetItem {
  id: string;
  name: string;
  keywords: string[];
  category: HybridAssetCategory;
  format: HybridAssetFormat;
  source: 'builtin' | 'folder' | 'uploaded' | 'ai_generated';
  url: string;
  cols?: number;
  rows?: number;
  frameCount?: number;
  fps?: number;
  createdAt?: string;
}

export interface VideoScript {
  id: string;
  title: string;
  hookBanner?: string;
  category: string;
  renderStyle?: VideoRenderStyle;
  aspectRatio: VideoAspectRatio;
  musicStyle: VideoMusicStyle;
  totalDurationSec: number;
  scenes: VideoScene[];
  fbCaption: string;
  createdAt: string;
  seed: number;
  voiceEngine?: VideoVoiceEngine;
  storyArc?: VideoStoryArc;
  subtitleStyle?: VideoSubtitleStyle;
  voiceClips?: VideoVoiceClip[];
}

export interface VideoItem extends VideoScript {
  status: PostStatus;
  scheduledFor?: string;
  publishedAt?: string;
  fbPostId?: string;
  errorMessage?: string;
}

export interface SavedRenderedVideo {
  id: string;
  videoId: string;
  title: string;
  category: string;
  renderStyle: VideoRenderStyle;
  aspectRatio: VideoAspectRatio;
  durationSec: number;
  sizeBytes: number;
  mimeType: string;
  createdAt: string;
  fbCaption?: string;
  serverUrl?: string;
}
