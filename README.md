# 🌿 Skardu Organics

<div align="center">

![Skardu Organics](public/img/Hero-section.png)

**Premium Organic Products from the Heart of the Himalayas**

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?style=for-the-badge)](https://skarduorganic.com)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

</div>

---

## 📋 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🏔️ About

**Skardu Organics** is a premium e-commerce platform specializing in authentic organic products sourced directly from the Skardu Valley in the Himalayas. Our product range includes:

- 🍯 **Pure Himalayan Shilajit** - Natural resin for vitality and wellness
- 🫒 **Cold-Pressed Organic Oils** - Apricot, Walnut, and Sea Buckthorn oils
- 🥜 **Sun-Dried Dry Fruits** - Almonds, Apricots, Walnuts, and more
- 🌿 **Natural Health Products** - Wild Forest Honey and herbal blends

---

## ✨ Features

### Customer Features
- 🛒 **Shopping Cart** - Add, remove, and manage products
- 🔐 **User Authentication** - Secure signup/login via Supabase Auth
- 📦 **Order Management** - Place orders with multiple payment options
- 📧 **Email Notifications** - Order confirmation emails via Resend
- 🔍 **Product Search** - Search and filter products by category
- 📱 **Responsive Design** - Optimized for all devices
- ⭐ **Product Reviews** - Rate and review products

### Technical Features
- ⚡ **Fast Performance** - Built with Vite for lightning-fast load times
- 🎨 **Modern UI** - Beautiful, accessible interface with TailwindCSS
- 🔒 **Secure Backend** - Supabase with Row Level Security (RLS)
- 📊 **Real-time Updates** - Live data synchronization
- 🌐 **SEO Optimized** - Meta tags and semantic HTML

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend** | React 18, TypeScript |
| **Styling** | TailwindCSS, Custom Theme |
| **Build Tool** | Vite 5 |
| **Backend** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth |
| **Email Service** | Resend (via Edge Functions) |
| **Deployment** | Vercel / Netlify / GitHub Pages |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/skardu-organic.git
   cd skardu-organic
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your Supabase credentials.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## 🔐 Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### For Supabase Edge Functions

Set these secrets in your Supabase project:

```bash
supabase secrets set RESEND_API_KEY=your_resend_api_key
supabase secrets set ADMIN_EMAIL=admin@yourdomain.com
supabase secrets set SITE_URL=https://yourdomain.com
```

---

## 📁 Project Structure

```
skardu-organic/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
├── components/
│   └── Icons.tsx               # SVG icon components
├── lib/
│   └── supabase.ts             # Supabase client
├── public/
│   └── img/                    # Static images
├── supabase/
│   └── functions/
│       └── send-order-email/   # Edge function for emails
├── App.tsx                     # Main application
├── assets.ts                   # Image path exports
├── constants.ts                # App constants
├── index.html                  # HTML entry point
├── index.tsx                   # React entry point
├── mockData.ts                 # Sample product data
├── types.ts                    # TypeScript interfaces
├── vite.config.ts              # Vite configuration
└── package.json
```

---

## 🗄️ Database Schema

### Tables

#### `profiles`
Extends Supabase auth.users
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key (from auth.users) |
| name | TEXT | User's full name |
| email | TEXT | User's email |
| is_admin | BOOLEAN | Admin flag |

#### `products`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | TEXT | Product name |
| image | TEXT | Image URL |
| category | TEXT | Product category |
| price | DECIMAL | Price in PKR |
| count_in_stock | INTEGER | Available stock |
| rating | DECIMAL | Average rating |

#### `orders`
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| order_id | TEXT | Human-readable order ID |
| user_id | UUID | Reference to user |
| order_items | JSONB | Cart items |
| shipping_address | JSONB | Delivery address |
| total_price | DECIMAL | Order total |
| order_status | TEXT | Processing/Shipped/Delivered |

---

## 🌐 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy!

### Netlify

```bash
npm run build
# Deploy the `dist` folder to Netlify
```

### GitHub Pages

Enable GitHub Pages in repository settings and configure the workflow.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📞 Contact

**Skardu Organics**

- 🌐 Website: [skarduorganic.com](https://skarduorganic.com)
- 📧 Email: contact@skarduorganic.com
- 📍 Location: Skardu, Gilgit-Baltistan, Pakistan

---

<div align="center">

**Made with ❤️ in the Himalayas**

</div>
