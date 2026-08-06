const fs = require('fs');
let code = fs.readFileSync('components/HostMarketing.tsx', 'utf8');

code = code.replace("import { import { motion, AnimatePresence } from 'framer-motion';", "import {\n  Grid,\n  Sparkles, CheckCircle, AlertTriangle, ShieldAlert, Play, Pause, BarChart3,\n  Tv, Eye, MousePointerClick, TrendingUp, DollarSign, Target, Plus,\n  Trash2, Send, Check, ShieldCheck, HelpCircle, Loader2, CreditCard, ExternalLink,\n  Heart, MessageSquare, Bookmark, ChevronLeft, ChevronRight, Volume2, VolumeX, Share2, MoreHorizontal, MoreVertical,\n  Library, Layers, PenTool, Sliders, MapPin, ArrowLeft, ArrowRight, Upload, ThumbsUp, Camera, Globe, Wifi, User, Compass, PlusCircle, Smartphone,\n  Gauge, Zap, Clock, BatteryCharging, X, Search, Video, Image, Maximize2, Filter, Star, CheckSquare, Square\n} from 'lucide-react';\nimport { motion, AnimatePresence } from 'framer-motion';");

fs.writeFileSync('components/HostMarketing.tsx', code);
console.log('Fixed imports');
