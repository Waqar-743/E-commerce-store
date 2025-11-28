import { createClient } from '@supabase/supabase-js';

// Get Supabase URL and Anon Key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file');
}

export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

// Database types for your tables
export interface DbProduct {
  id: string;
  name: string;
  image: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  count_in_stock: number;
  rating: number;
  num_reviews: number;
  created_at: string;
}

export interface DbReview {
  id: string;
  product_id: string;
  user_id: string;
  name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface DbUser {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  created_at: string;
}

export interface DbOrder {
  id: string;
  user_id: string;
  order_items: any;
  shipping_address: any;
  payment_method: string;
  items_price: number;
  shipping_price: number;
  total_price: number;
  is_paid: boolean;
  paid_at: string | null;
  is_delivered: boolean;
  delivered_at: string | null;
  order_status: string;
  created_at: string;
}
