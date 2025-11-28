-- =====================================================
-- SKARDU ORGANIC - SUPABASE DATABASE SCHEMA
-- Run this SQL in Supabase SQL Editor
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. PROFILES TABLE (extends Supabase auth.users)
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists and create new one
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 2. PRODUCTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'Skardu Organics',
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  count_in_stock INTEGER NOT NULL DEFAULT 0,
  rating DECIMAL(3, 2) DEFAULT 0,
  num_reviews INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Everyone can view products
CREATE POLICY "Products are viewable by everyone" ON products
  FOR SELECT USING (true);

-- Only admins can insert/update/delete products
CREATE POLICY "Admins can insert products" ON products
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can update products" ON products
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins can delete products" ON products
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- =====================================================
-- 3. REVIEWS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Everyone can view reviews
CREATE POLICY "Reviews are viewable by everyone" ON reviews
  FOR SELECT USING (true);

-- Authenticated users can add reviews
CREATE POLICY "Authenticated users can add reviews" ON reviews
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own reviews
CREATE POLICY "Users can update their own reviews" ON reviews
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own reviews
CREATE POLICY "Users can delete their own reviews" ON reviews
  FOR DELETE USING (auth.uid() = user_id);

-- =====================================================
-- 4. ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id TEXT UNIQUE DEFAULT 'SO-' || FLOOR(RANDOM() * 900000 + 100000)::TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_items JSONB NOT NULL,
  shipping_address JSONB NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'COD',
  items_price DECIMAL(10, 2) NOT NULL,
  shipping_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_price DECIMAL(10, 2) NOT NULL,
  order_status TEXT NOT NULL DEFAULT 'Processing' CHECK (order_status IN ('Processing', 'Shipped', 'Delivered', 'Cancelled')),
  is_paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMP WITH TIME ZONE,
  is_delivered BOOLEAN DEFAULT FALSE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Users can view their own orders
CREATE POLICY "Users can view their own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Authenticated users can create orders
CREATE POLICY "Authenticated users can create orders" ON orders
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can update orders
CREATE POLICY "Admins can update orders" ON orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- =====================================================
-- 5. INSERT SAMPLE PRODUCTS
-- =====================================================
INSERT INTO products (name, image, brand, category, description, price, count_in_stock, rating, num_reviews) VALUES
  ('Himalayan Shilajit Resin (20g)', '/img/Organic-Shilijit (20g).png', 'Skardu Organics', 'Shilajit', '100% pure, lab-tested Shilajit resin harvested from the highest altitudes of the Himalayas. A potent source of fulvic acid and over 84 essential minerals.', 4500, 15, 4.8, 3),
  ('Organic Apricot Kernel Oil (120ml)', 'https://picsum.photos/id/1025/400/400', 'Skardu Organics', 'Organic Oils', 'Cold-pressed from the finest apricot kernels of Skardu Valley. Rich in Vitamin E and antioxidants, perfect for skin and hair nourishment.', 1200, 30, 4.5, 2),
  ('Sun-Dried Organic Apricots (500g)', '/img/Dried-Appricot-599g.png', 'Skardu Organics', 'Dry Fruits', 'Naturally sweet and chewy sun-dried apricots from Gilgit-Baltistan. No added sugar or preservatives. A healthy and delicious snack.', 950, 50, 4.7, 0),
  ('Wild Forest Honey (250g)', 'https://picsum.photos/id/1068/400/400', 'Skardu Organics', 'Natural Foods', 'Raw and unfiltered honey sourced from the wild forests of the Karakoram range. Possesses unique floral notes and immense health benefits.', 1500, 25, 4.9, 0),
  ('Organic Almonds (Kaghazi Badam) (500g)', '/img/Almoid-599g.png', 'Skardu Organics', 'Dry Fruits', 'Premium quality paper-thin shell almonds (Kaghazi Badam) that are easy to crack and delicious to eat. Packed with nutrients.', 1800, 40, 4.6, 0),
  ('Sea Buckthorn Oil (30ml)', 'https://picsum.photos/id/312/400/400', 'Skardu Organics', 'Organic Oils', 'A powerhouse of Omega-7, vitamins, and antioxidants. Our Sea Buckthorn oil is perfect for rejuvenating skin and promoting internal health.', 2200, 18, 4.8, 0),
  ('Organic Walnuts (Akhrot) (500g)', 'https://picsum.photos/id/431/400/400', 'Skardu Organics', 'Dry Fruits', 'Fresh and crunchy walnuts from the valleys of Skardu. An excellent source of Omega-3 fatty acids and a great brain food.', 1600, 35, 4.5, 0),
  ('Advanced Shilajit Gold Capsules (60 count)', '/img/PURE-SHILIJIT(20g).png', 'Skardu Organics', 'Shilajit', 'Experience the benefits of Shilajit in a convenient capsule form, enriched with other Ayurvedic herbs for enhanced vitality and performance.', 5500, 10, 4.9, 0),
  ('Pure Shilajit Drops (30ml)', '/img/Organic-shilijit-3g.png', 'Skardu Organics', 'Shilajit', 'Convenient and easy-to-use Shilajit drops. A liquid supplement for quick absorption and daily wellness.', 3800, 22, 4.7, 0),
  ('Shilajit with Ashwagandha', '/img/Shilijit-10g.png', 'Skardu Organics', 'Shilajit', 'A powerful blend of Himalayan Shilajit and Ashwagandha root extract to combat stress and boost energy levels.', 4900, 12, 4.9, 0),
  ('Sun-Dried Raw Shilajit Stone (50g)', '/img/PURE-SHILIJIT(20g).png', 'Skardu Organics', 'Shilajit', 'Raw, sun-dried Shilajit in its most natural form. For the purists who prefer traditional preparation methods.', 6000, 8, 4.6, 0),
  ('Shilajit Power Mix with Herbs (30g)', '/img/Organic-Shilijit (20g).png', 'Skardu Organics', 'Shilajit', 'A potent mix of Shilajit resin with a blend of traditional herbs for maximum vitality and strength.', 5200, 14, 4.8, 0),
  ('Cold-Pressed Walnut Oil (120ml)', 'https://picsum.photos/id/15/400/400', 'Skardu Organics', 'Organic Oils', '100% pure cold-pressed walnut oil. Rich in Omega-3, it is excellent for brain health and as a salad dressing.', 1800, 25, 4.7, 0),
  ('Organic Black Seed Oil (100ml)', 'https://picsum.photos/id/16/400/400', 'Skardu Organics', 'Organic Oils', 'Known as "the cure for everything except death," our black seed oil is cold-pressed to preserve its powerful compounds.', 2500, 20, 4.9, 0),
  ('Pure Organic Castor Oil (150ml)', 'https://picsum.photos/id/17/400/400', 'Skardu Organics', 'Organic Oils', 'A versatile oil known for promoting hair growth and nourishing the skin. Hexane-free and cold-pressed.', 900, 40, 4.5, 0),
  ('Relaxing Apricot Massage Oil (200ml)', 'https://picsum.photos/id/18/400/400', 'Skardu Organics', 'Organic Oils', 'A light, non-greasy massage oil made from pure apricot oil and infused with calming essential oils.', 1500, 30, 4.6, 0),
  ('Organic Dried Figs (Anjeer) (500g)', 'https://picsum.photos/id/19/400/400', 'Skardu Organics', 'Dry Fruits', 'Naturally sweet and packed with fiber, our organic dried figs are a perfect healthy treat.', 2100, 33, 4.8, 0),
  ('Organic Pine Nuts (Chilgoza) (250g)', 'https://picsum.photos/id/21/400/400', 'Skardu Organics', 'Dry Fruits', 'A delicacy from the high-altitude forests of Gilgit-Baltistan, these pine nuts are rich in flavor and nutrients.', 3500, 15, 4.9, 0),
  ('Dried Mulberries (Shahtoot) (400g)', 'https://picsum.photos/id/22/400/400', 'Skardu Organics', 'Dry Fruits', 'Sun-dried white mulberries, a naturally sweet superfood packed with iron, vitamin C, and antioxidants.', 1100, 45, 4.7, 0)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 6. FUNCTIONS FOR UPDATING PRODUCT RATINGS
-- =====================================================
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products
  SET 
    rating = (SELECT COALESCE(AVG(rating), 0) FROM reviews WHERE product_id = NEW.product_id),
    num_reviews = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id),
    updated_at = NOW()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updating rating when review is added/updated/deleted
DROP TRIGGER IF EXISTS update_product_rating_trigger ON reviews;
CREATE TRIGGER update_product_rating_trigger
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_product_rating();

-- =====================================================
-- 7. FUNCTION TO UPDATE STOCK
-- =====================================================
CREATE OR REPLACE FUNCTION update_product_stock(product_id UUID, quantity_change INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET 
    count_in_stock = count_in_stock + quantity_change,
    updated_at = NOW()
  WHERE id = product_id;
END;
$$ LANGUAGE plpgsql;
