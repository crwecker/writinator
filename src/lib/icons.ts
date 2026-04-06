import type { LucideIcon } from 'lucide-react'
import {
  // Writing
  FileText, BookOpen, Notebook, PenTool, Pencil, Type, AlignLeft, Quote,
  ScrollText, BookMarked, Library, FileEdit, Newspaper, MessageSquare, StickyNote,
  // Characters
  User, Users, UserCircle, Baby, PersonStanding, Skull, Crown, Heart, Brain,
  Eye, Hand, Footprints, Ghost, Laugh, Frown,
  // World
  Globe, Map, MapPin, Mountain, Building, Castle, Home, Landmark, Church,
  TreePine, Palmtree, Compass, Anchor, Ship, Plane,
  // Objects
  Sword, Shield, Key, Lock, Gem, Diamond, Scroll, Lamp, Lightbulb, Gift,
  Package, Camera, Clock, Hourglass, Telescope,
  // Nature
  Sun, Moon, Star, Cloud, Zap, Snowflake, Flame, Droplet, Wind, Leaf,
  Flower, Bug, Fish, Bird, Cat,
  // Food & Drink
  Coffee, Wine, Apple, Cherry, Egg, Pizza, Utensils, CakeSlice, Cookie, Candy,
  // Science & Tech
  Atom, Beaker, Dna, Microscope, Cpu, Database, Wifi, Radio, Rocket, Satellite,
  // Shapes & Symbols
  Circle, Square, Triangle, Hexagon, Hash, AtSign, AlertTriangle, Info,
  HelpCircle, CheckCircle, XCircle, Flag, Bookmark, Tag,
  // Music & Art
  Music, Headphones, Mic, Palette, Brush, Scissors, Frame, Clapperboard, Drama, Theater,
} from 'lucide-react'

export interface IconEntry {
  name: string
  category: string
}

export const ICON_CATALOG: IconEntry[] = [
  // Writing
  { name: 'FileText', category: 'Writing' },
  { name: 'BookOpen', category: 'Writing' },
  { name: 'Notebook', category: 'Writing' },
  { name: 'PenTool', category: 'Writing' },
  { name: 'Pencil', category: 'Writing' },
  { name: 'Type', category: 'Writing' },
  { name: 'AlignLeft', category: 'Writing' },
  { name: 'Quote', category: 'Writing' },
  { name: 'ScrollText', category: 'Writing' },
  { name: 'BookMarked', category: 'Writing' },
  { name: 'Library', category: 'Writing' },
  { name: 'FileEdit', category: 'Writing' },
  { name: 'Newspaper', category: 'Writing' },
  { name: 'MessageSquare', category: 'Writing' },
  { name: 'StickyNote', category: 'Writing' },

  // Characters
  { name: 'User', category: 'Characters' },
  { name: 'Users', category: 'Characters' },
  { name: 'UserCircle', category: 'Characters' },
  { name: 'Baby', category: 'Characters' },
  { name: 'PersonStanding', category: 'Characters' },
  { name: 'Skull', category: 'Characters' },
  { name: 'Crown', category: 'Characters' },
  { name: 'Heart', category: 'Characters' },
  { name: 'Brain', category: 'Characters' },
  { name: 'Eye', category: 'Characters' },
  { name: 'Hand', category: 'Characters' },
  { name: 'Footprints', category: 'Characters' },
  { name: 'Ghost', category: 'Characters' },
  { name: 'Laugh', category: 'Characters' },
  { name: 'Frown', category: 'Characters' },

  // World
  { name: 'Globe', category: 'World' },
  { name: 'Map', category: 'World' },
  { name: 'MapPin', category: 'World' },
  { name: 'Mountain', category: 'World' },
  { name: 'Building', category: 'World' },
  { name: 'Castle', category: 'World' },
  { name: 'Home', category: 'World' },
  { name: 'Landmark', category: 'World' },
  { name: 'Church', category: 'World' },
  { name: 'TreePine', category: 'World' },
  { name: 'Palmtree', category: 'World' },
  { name: 'Compass', category: 'World' },
  { name: 'Anchor', category: 'World' },
  { name: 'Ship', category: 'World' },
  { name: 'Plane', category: 'World' },

  // Objects
  { name: 'Sword', category: 'Objects' },
  { name: 'Shield', category: 'Objects' },
  { name: 'Key', category: 'Objects' },
  { name: 'Lock', category: 'Objects' },
  { name: 'Gem', category: 'Objects' },
  { name: 'Diamond', category: 'Objects' },
  { name: 'Scroll', category: 'Objects' },
  { name: 'Lamp', category: 'Objects' },
  { name: 'Lightbulb', category: 'Objects' },
  { name: 'Gift', category: 'Objects' },
  { name: 'Package', category: 'Objects' },
  { name: 'Camera', category: 'Objects' },
  { name: 'Clock', category: 'Objects' },
  { name: 'Hourglass', category: 'Objects' },
  { name: 'Telescope', category: 'Objects' },

  // Nature
  { name: 'Sun', category: 'Nature' },
  { name: 'Moon', category: 'Nature' },
  { name: 'Star', category: 'Nature' },
  { name: 'Cloud', category: 'Nature' },
  { name: 'Zap', category: 'Nature' },
  { name: 'Snowflake', category: 'Nature' },
  { name: 'Flame', category: 'Nature' },
  { name: 'Droplet', category: 'Nature' },
  { name: 'Wind', category: 'Nature' },
  { name: 'Leaf', category: 'Nature' },
  { name: 'Flower', category: 'Nature' },
  { name: 'Bug', category: 'Nature' },
  { name: 'Fish', category: 'Nature' },
  { name: 'Bird', category: 'Nature' },
  { name: 'Cat', category: 'Nature' },

  // Food & Drink
  { name: 'Coffee', category: 'Food & Drink' },
  { name: 'Wine', category: 'Food & Drink' },
  { name: 'Apple', category: 'Food & Drink' },
  { name: 'Cherry', category: 'Food & Drink' },
  { name: 'Egg', category: 'Food & Drink' },
  { name: 'Pizza', category: 'Food & Drink' },
  { name: 'Utensils', category: 'Food & Drink' },
  { name: 'CakeSlice', category: 'Food & Drink' },
  { name: 'Cookie', category: 'Food & Drink' },
  { name: 'Candy', category: 'Food & Drink' },

  // Science & Tech
  { name: 'Atom', category: 'Science & Tech' },
  { name: 'Beaker', category: 'Science & Tech' },
  { name: 'Dna', category: 'Science & Tech' },
  { name: 'Microscope', category: 'Science & Tech' },
  { name: 'Cpu', category: 'Science & Tech' },
  { name: 'Database', category: 'Science & Tech' },
  { name: 'Wifi', category: 'Science & Tech' },
  { name: 'Radio', category: 'Science & Tech' },
  { name: 'Rocket', category: 'Science & Tech' },
  { name: 'Satellite', category: 'Science & Tech' },

  // Shapes & Symbols
  { name: 'Circle', category: 'Shapes & Symbols' },
  { name: 'Square', category: 'Shapes & Symbols' },
  { name: 'Triangle', category: 'Shapes & Symbols' },
  { name: 'Hexagon', category: 'Shapes & Symbols' },
  { name: 'Star', category: 'Shapes & Symbols' },
  { name: 'Hash', category: 'Shapes & Symbols' },
  { name: 'AtSign', category: 'Shapes & Symbols' },
  { name: 'AlertTriangle', category: 'Shapes & Symbols' },
  { name: 'Info', category: 'Shapes & Symbols' },
  { name: 'HelpCircle', category: 'Shapes & Symbols' },
  { name: 'CheckCircle', category: 'Shapes & Symbols' },
  { name: 'XCircle', category: 'Shapes & Symbols' },
  { name: 'Flag', category: 'Shapes & Symbols' },
  { name: 'Bookmark', category: 'Shapes & Symbols' },
  { name: 'Tag', category: 'Shapes & Symbols' },

  // Music & Art
  { name: 'Music', category: 'Music & Art' },
  { name: 'Headphones', category: 'Music & Art' },
  { name: 'Mic', category: 'Music & Art' },
  { name: 'Palette', category: 'Music & Art' },
  { name: 'Brush', category: 'Music & Art' },
  { name: 'Scissors', category: 'Music & Art' },
  { name: 'Frame', category: 'Music & Art' },
  { name: 'Clapperboard', category: 'Music & Art' },
  { name: 'Drama', category: 'Music & Art' },
  { name: 'Theater', category: 'Music & Art' },
]

const ICON_MAP: Record<string, LucideIcon> = {
  // Writing
  FileText, BookOpen, Notebook, PenTool, Pencil, Type, AlignLeft, Quote,
  ScrollText, BookMarked, Library, FileEdit, Newspaper, MessageSquare, StickyNote,
  // Characters
  User, Users, UserCircle, Baby, PersonStanding, Skull, Crown, Heart, Brain,
  Eye, Hand, Footprints, Ghost, Laugh, Frown,
  // World
  Globe, Map, MapPin, Mountain, Building, Castle, Home, Landmark, Church,
  TreePine, Palmtree, Compass, Anchor, Ship, Plane,
  // Objects
  Sword, Shield, Key, Lock, Gem, Diamond, Scroll, Lamp, Lightbulb, Gift,
  Package, Camera, Clock, Hourglass, Telescope,
  // Nature
  Sun, Moon, Star, Cloud, Zap, Snowflake, Flame, Droplet, Wind, Leaf,
  Flower, Bug, Fish, Bird, Cat,
  // Food & Drink
  Coffee, Wine, Apple, Cherry, Egg, Pizza, Utensils, CakeSlice, Cookie, Candy,
  // Science & Tech
  Atom, Beaker, Dna, Microscope, Cpu, Database, Wifi, Radio, Rocket, Satellite,
  // Shapes & Symbols
  Circle, Square, Triangle, Hexagon, Hash, AtSign, AlertTriangle, Info,
  HelpCircle, CheckCircle, XCircle, Flag, Bookmark, Tag,
  // Music & Art
  Music, Headphones, Mic, Palette, Brush, Scissors, Frame, Clapperboard, Drama, Theater,
}

export function getIconComponent(name: string): LucideIcon {
  return ICON_MAP[name] ?? ICON_MAP.FileText
}
