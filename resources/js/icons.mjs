// Icon-System: Lucide-Formen als Inline-SVG, einheitlich 2px Strich.
import {
  CalendarDays, ShoppingCart, BookOpen, Archive, ChevronLeft, ChevronRight, Share2, Settings, Plus,
  EllipsisVertical, Ellipsis, Copy, Trash2, Pencil, Search, X, Check, Star, Sunrise, Sun, Moon, Utensils,
  BookMarked, Sparkles, Play, ExternalLink, KeyRound, Download, Upload, ArrowDownAZ, ArrowLeft, CalendarPlus,
  Undo2, CircleAlert, LoaderCircle, History, Link, GripVertical, Eye, EyeOff, Info,
  Apple, Milk, Snowflake, Wheat, Candy, SprayCan, Package, Mic, Minus, Store, StickyNote, Circle, ChevronDown, ShoppingBasket,
  ToyBrick, Lock, CloudUpload, FileArchive, Users, User, Share,
  Menu, ChefHat, ChartColumn, Bike, Lightbulb, Recycle, Repeat, CalendarClock, PackagePlus, TrendingUp, TrendingDown,
  Equal, Headphones, Play as PlayIcon, Pause, RotateCcw, RotateCw, Timer, Euro, Gift, FolderOpen, Library, Receipt, Image,
  Fish, Droplet, Droplets, Leaf, Camera, Bell, BellRing, BellOff, Thermometer, ZoomIn, ZoomOut, ChartSpline, List, Waves, Sprout,
  TriangleAlert, Clock, RefreshCw, FileImage, FileVideo, FileText, Smartphone, Heart, Flame, Trophy, Zap, ScanSearch, HardDrive,
  Target, Shrimp, Snail, Images, Crown, CircleCheck, Cookie,
} from 'lucide';

const ICONS = {
  plan: CalendarDays, shop: ShoppingCart, recipes: BookOpen, pantry: Archive,
  'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, share: Share2, settings: Settings, plus: Plus,
  dots: EllipsisVertical, 'dots-h': Ellipsis, copy: Copy, trash: Trash2, pencil: Pencil, search: Search, x: X,
  check: Check, star: Star, breakfast: Sunrise, lunch: Sun, dinner: Moon, extra: Utensils, recipe: BookMarked,
  sparkles: Sparkles, play: Play, external: ExternalLink, key: KeyRound, download: Download, upload: Upload,
  az: ArrowDownAZ, back: ArrowLeft, 'calendar-plus': CalendarPlus, undo: Undo2, alert: CircleAlert,
  spinner: LoaderCircle, history: History, link: Link, grip: GripVertical, eye: Eye, 'eye-off': EyeOff, info: Info,
  'dept-produce': Apple, 'dept-chilled': Milk, 'dept-frozen': Snowflake, 'dept-staples': Wheat, 'dept-snacks': Candy,
  'dept-household': SprayCan, 'dept-other': Package, mic: Mic, minus: Minus, store: Store, note: StickyNote,
  circle: Circle, 'chevron-down': ChevronDown, basket: ShoppingBasket,
  brick: ToyBrick, lock: Lock, cloud: CloudUpload, zip: FileArchive, users: Users, user: User, 'share-file': Share,
  menu: Menu, chef: ChefHat, stats: ChartColumn, order: Bike, idea: Lightbulb, leftover: Recycle, repeat: Repeat,
  'available': CalendarClock, 'to-pantry': PackagePlus, 'trend-up': TrendingUp, 'trend-down': TrendingDown, equal: Equal,
  headphones: Headphones, 'play-solid': PlayIcon, pause: Pause, 'rewind': RotateCcw, 'forward': RotateCw, timer: Timer,
  euro: Euro, gift: Gift, folder: FolderOpen, library: Library, receipt: Receipt, image: Image, tools: Plus,
  fish: Fish, drop: Droplet, drops: Droplets, leaf: Leaf, camera: Camera, bell: Bell, 'bell-ring': BellRing, 'bell-off': BellOff,
  thermo: Thermometer, 'zoom-in': ZoomIn, 'zoom-out': ZoomOut, chart: ChartSpline, list: List, waves: Waves, sprout: Sprout,
  warn: TriangleAlert, clock: Clock, refresh: RefreshCw, 'file-image': FileImage, 'file-video': FileVideo, 'file-text': FileText,
  phone: Smartphone, heart: Heart, flame: Flame, trophy: Trophy, zap: Zap, scan: ScanSearch, drive: HardDrive, target: Target,
  shrimp: Shrimp, snail: Snail, images: Images, crown: Crown, 'check-circle': CircleCheck, food: Cookie,
};

const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');

export function iconSvg(name, { fill = false } = {}) {
  const node = ICONS[name];
  if (!node) return '';
  const inner = node.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  return `<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
