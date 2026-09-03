import {
  ShoppingCart, Home, Utensils, Car, Plane, Wifi, Tv, Music, Heart, PiggyBank,
  Landmark, Briefcase, GraduationCap, Gift, Gamepad2, Dumbbell, Stethoscope,
  Fuel, CreditCard, Wallet, Coffee, ShoppingBag, Dog, Smartphone, ArrowLeftRight,
  Shield, Zap, TrainFront, Bus, Mail, Receipt, TrendingUp, Baby, Sofa, Shirt,
  Scissors, Banknote, Ticket, Sparkles, Laptop, BookOpen, Film, Palette, Trophy,
  Hammer, Flower2, HeartHandshake, ParkingCircle, Ship, Sandwich, Umbrella,
  Building2, School, Bike, PartyPopper,
  HelpCircle, type LucideIcon,
} from 'lucide-react'

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ShoppingCart, Home, Utensils, Car, Plane, Wifi, Tv, Music, Heart, PiggyBank,
  Landmark, Briefcase, GraduationCap, Gift, Gamepad2, Dumbbell, Stethoscope,
  Fuel, CreditCard, Wallet, Coffee, ShoppingBag, Dog, Smartphone, ArrowLeftRight,
  Shield, Zap, TrainFront, Bus, Mail, Receipt, TrendingUp, Baby, Sofa, Shirt,
  Scissors, Banknote, Ticket, Sparkles, Laptop, BookOpen, Film, Palette, Trophy,
  Hammer, Flower2, HeartHandshake, ParkingCircle, Ship, Sandwich, Umbrella,
  Building2, School, Bike, PartyPopper,
}

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS)

export const DEFAULT_CATEGORY_ICON: LucideIcon = HelpCircle

export function getCategoryIcon(name?: string | null): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || DEFAULT_CATEGORY_ICON
}
