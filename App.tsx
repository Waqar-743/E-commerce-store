
import React, { useState, useEffect, useContext, createContext, useMemo, useCallback, useRef } from 'react';
import { Product, CartItem, CartContextType, User, AuthContextType, Review } from './types';
import { HERO_SLIDES, TESTIMONIALS } from './constants';
import { SHILAJIT_IMAGE_URL, BUY1_GET1_FREE_URL, PURE_APRICOT_OIL_URL } from './assets';
import { ShoppingCartIcon, UserIcon, TruckIcon, LeafIcon, SavingsIcon, ReturnIcon, StarIcon, SendIcon, SearchIcon, XIcon, PlusIcon, MinusIcon, ChevronLeftIcon, ChevronRightIcon, MenuIcon, FilterIcon, ShieldCheckIcon, MountainIcon, HandHeartIcon, PureDropIcon, HistoryIcon, CreditCardIcon, SmartphoneIcon } from './components/Icons';
import { MOCK_PRODUCTS } from './mockData';
import { supabase } from './lib/supabase';

// --- CONSTANTS & THEME ---
// Note: Color theme is largely handled by Tailwind custom config in index.html
// primary: #1A3C34 (Deep Green)
// secondary: #C8A165 (Gold)

// --- SEARCH UTILS ---
const levenshteinDistance = (s1: string, s2: string): number => {
    const len1 = s1.length;
    const len2 = s2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) matrix[i] = [i];
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,       // deletion
                matrix[i][j - 1] + 1,       // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[len1][len2];
};

const performAdvancedSearch = (products: Product[], query: string): Product[] => {
    if (!query.trim()) return products;

    const lowerQuery = query.toLowerCase().trim();
    // Common stop words to ignore to focus on intent
    const stopWords = ['for', 'and', 'the', 'in', 'of', 'to', 'a', 'with', 'is'];
    const terms = lowerQuery.split(/\s+/).filter(t => t.length > 1 && !stopWords.includes(t));

    if (terms.length === 0) return products;

    const scoredProducts = products.map(p => {
        let score = 0;
        const name = p.name.toLowerCase();
        const category = p.category.toLowerCase();
        const description = p.description.toLowerCase();
        
        // Tokenize product text for word-level matching
        const productWords = `${name} ${category} ${description}`.split(/\W+/);

        // 1. Exact Phrase Match (Highest Priority)
        if (name.includes(lowerQuery)) score += 50;
        if (category.includes(lowerQuery)) score += 40;
        if (description.includes(lowerQuery)) score += 20;
        
        terms.forEach(term => {
            // 2. Term Exact Matching
            if (name.includes(term)) score += 15;
            if (category.includes(term)) score += 10;
            if (description.includes(term)) score += 5;

            // 3. Fuzzy Matching (Typos)
            // Check if term matches any word in the product text within distance 2
            // Only fuzzy match terms longer than 3 chars to avoid false positives on short words
            if (term.length > 3) {
                const fuzzyMatchFound = productWords.some(word => 
                    Math.abs(word.length - term.length) <= 2 && 
                    levenshteinDistance(word, term) <= 2
                );
                if (fuzzyMatchFound) score += 4;
            }

            // 4. Intent/Context Mapping (NLP-lite)
            // Skin/Beauty Intent
            if (['skin', 'face', 'hair', 'glow', 'beauty', 'moisturizing', 'dry', 'soft', 'smooth'].includes(term)) {
                if (category.includes('oil') || description.includes('skin') || description.includes('hair')) score += 8;
            }
            // Energy/Health Intent
            if (['energy', 'power', 'strength', 'stamina', 'immune', 'immunity', 'weakness', 'vitality'].includes(term)) {
                if (category.includes('shilajit') || name.includes('shilajit')) score += 8;
            }
            // Food/Snack Intent
            if (['snack', 'eat', 'hungry', 'diet', 'healthy', 'food', 'munch'].includes(term)) {
                if (category.includes('dry fruits') || category.includes('natural foods')) score += 8;
            }
             // Pain/Relief Intent
            if (['pain', 'joint', 'relief', 'muscle', 'relax'].includes(term)) {
                if (category.includes('oil') || name.includes('massage') || name.includes('shilajit')) score += 8;
            }
        });

        return { product: p, score };
    });

    // Filter out zero scores and sort by relevance
    const result = scoredProducts
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.product);
        
    // If no results found with scoring, return empty (or fallback to standard include if desired, but scoring covers includes)
    return result;
};

// --- HELPER UTILS ---
const handleEnterOrSpace = (e: React.KeyboardEvent, callback: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        callback();
    }
};

// --- PRODUCT CONTEXT ---
interface ProductContextType {
    products: Product[];
    updateProductStock: (productId: string, quantityChange: number) => void;
    addProductReview: (productId: string, review: {name: string, rating: number, comment: string}) => void;
    loading: boolean;
    error: string;
    refreshProducts: () => void;
}

const ProductContext = createContext<ProductContextType | null>(null);

const ProductProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchProducts = async () => {
        setLoading(true);
        setError('');
        try {
            // Try to fetch from Supabase
            const { data: productsData, error: productsError } = await supabase
                .from('products')
                .select('*')
                .order('created_at', { ascending: false });

            if (productsError) {
                console.warn('Supabase error, falling back to mock data:', productsError.message);
                setProducts(MOCK_PRODUCTS);
            } else if (productsData && productsData.length > 0) {
                // Fetch reviews for each product
                const { data: reviewsData } = await supabase
                    .from('reviews')
                    .select('*');

                // Map Supabase data to our Product type
                const mappedProducts: Product[] = productsData.map(p => {
                    const productReviews = reviewsData?.filter(r => r.product_id === p.id) || [];
                    return {
                        _id: p.id,
                        name: p.name,
                        image: p.image,
                        brand: p.brand,
                        category: p.category,
                        description: p.description,
                        price: p.price,
                        countInStock: p.count_in_stock,
                        rating: p.rating || 0,
                        numReviews: p.num_reviews || 0,
                        reviews: productReviews.map(r => ({
                            _id: r.id,
                            name: r.name,
                            rating: r.rating,
                            comment: r.comment || '',
                            createdAt: r.created_at
                        }))
                    };
                });
                setProducts(mappedProducts);
            } else {
                // No products in Supabase, use mock data
                console.log('No products in Supabase, using mock data');
                setProducts(MOCK_PRODUCTS);
            }
        } catch (err: any) {
            console.warn('Error fetching products, using mock data:', err.message);
            setProducts(MOCK_PRODUCTS);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    const refreshProducts = () => {
        fetchProducts();
    };

    const updateProductStock = async (productId: string, quantityChange: number) => {
        // Update local state immediately for better UX
        setProducts(prevProducts =>
            prevProducts.map(p =>
                p._id === productId
                    ? { ...p, countInStock: p.countInStock + quantityChange }
                    : p
            )
        );

        // Try to update in Supabase (fire and forget for now)
        try {
            const product = products.find(p => p._id === productId);
            if (product) {
                await supabase
                    .from('products')
                    .update({ count_in_stock: product.countInStock + quantityChange })
                    .eq('id', productId);
            }
        } catch (err) {
            console.warn('Failed to update stock in Supabase:', err);
        }
    };

    const addProductReview = async (productId: string, reviewData: {name: string, rating: number, comment: string}) => {
        const newReview: Review = {
            _id: Date.now().toString(),
            name: reviewData.name,
            rating: reviewData.rating,
            comment: reviewData.comment,
            createdAt: new Date().toISOString(),
        };

        // Update local state immediately
        setProducts(prevProducts =>
            prevProducts.map(p => {
                if (p._id === productId) {
                    const currentReviews = p.reviews || [];
                    const updatedReviews = [...currentReviews, newReview];
                    const newRating = updatedReviews.reduce((acc, r) => acc + r.rating, 0) / updatedReviews.length;

                    return {
                        ...p,
                        reviews: updatedReviews,
                        numReviews: updatedReviews.length,
                        rating: parseFloat(newRating.toFixed(1))
                    };
                }
                return p;
            })
        );

        // Try to save to Supabase
        try {
            const { data: session } = await supabase.auth.getSession();
            await supabase.from('reviews').insert({
                product_id: productId,
                user_id: session?.session?.user?.id || null,
                name: reviewData.name,
                rating: reviewData.rating,
                comment: reviewData.comment
            });
        } catch (err) {
            console.warn('Failed to save review to Supabase:', err);
        }
    };

    const value = { products, updateProductStock, addProductReview, loading, error, refreshProducts };
    return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

const useProducts = () => useContext(ProductContext) as ProductContextType;

// --- CART CONTEXT ---
const CartContext = createContext<CartContextType | null>(null);

const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const { products, updateProductStock } = useProducts();

    const addToCart = (product: Product, quantity: number = 1) => {
        const productInState = products.find(p => p._id === product._id);
        if (!productInState || productInState.countInStock <= 0) return;

        const existingItem = cartItems.find(item => item._id === product._id);
        let quantityAdded = 0;

        if (existingItem) {
            const newQuantity = Math.min(existingItem.quantity + quantity, existingItem.quantity + productInState.countInStock);
            quantityAdded = newQuantity - existingItem.quantity;
        } else {
            const newQuantity = Math.min(quantity, productInState.countInStock);
            quantityAdded = newQuantity;
        }

        if (quantityAdded <= 0) return;

        setCartItems(prevItems => {
            const itemExists = prevItems.find(i => i._id === product._id);
            if (itemExists) {
                return prevItems.map(i => i._id === product._id ? { ...i, quantity: i.quantity + quantityAdded } : i);
            }
            return [...prevItems, { ...productInState, quantity: quantityAdded }];
        });

        updateProductStock(product._id, -quantityAdded);
    };

    const removeFromCart = (productId: string) => {
        const itemToRemove = cartItems.find(item => item._id === productId);
        if (itemToRemove) {
            updateProductStock(productId, itemToRemove.quantity);
            setCartItems(prevItems => prevItems.filter(item => item._id !== productId));
        }
    };

    const updateQuantity = (productId: string, newQuantity: number) => {
        const itemToUpdate = cartItems.find(item => item._id === productId);
        const productFromState = products.find(p => p._id === productId);

        if (!itemToUpdate || !productFromState) return;

        if (newQuantity <= 0) {
            removeFromCart(productId);
        } else {
            const totalStock = productFromState.countInStock + itemToUpdate.quantity;
            const cappedQuantity = Math.min(newQuantity, totalStock);
            const quantityChange = cappedQuantity - itemToUpdate.quantity;

            if (quantityChange !== 0) {
                setCartItems(prevItems =>
                    prevItems.map(item =>
                        item._id === productId ? { ...item, quantity: cappedQuantity } : item
                    )
                );
                updateProductStock(productId, -quantityChange);
            }
        }
    };

    const clearCart = () => {
        cartItems.forEach(item => {
            updateProductStock(item._id, item.quantity);
        });
        setCartItems([]);
    };
    
    const checkoutClearCart = () => {
        setCartItems([]);
    };

    const cartCount = useMemo(() => {
        return cartItems.reduce((count, item) => count + item.quantity, 0);
    }, [cartItems]);

    const cartTotal = useMemo(() => {
        return cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
    }, [cartItems]);

    const value = { cartItems, addToCart, removeFromCart, updateQuantity, clearCart, checkoutClearCart, cartTotal, cartCount };

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

const useCart = () => useContext(CartContext) as CartContextType;

// --- AUTH CONTEXT ---
const AuthContext = createContext<AuthContextType | null>(null);

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        // Check for existing session on mount
        const initializeAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    // Fetch user profile from profiles table
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', session.user.id)
                        .single();

                    setCurrentUser({
                        _id: session.user.id,
                        name: profile?.name || session.user.email?.split('@')[0] || 'User',
                        email: session.user.email || '',
                        isAdmin: profile?.is_admin || false,
                        token: session.access_token,
                    });
                }
            } catch (error) {
                console.error("Failed to initialize auth:", error);
            } finally {
                setAuthLoading(false);
            }
        };

        initializeAuth();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session?.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                setCurrentUser({
                    _id: session.user.id,
                    name: profile?.name || session.user.email?.split('@')[0] || 'User',
                    email: session.user.email || '',
                    isAdmin: profile?.is_admin || false,
                    token: session.access_token,
                });
            } else if (event === 'SIGNED_OUT') {
                setCurrentUser(null);
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const login = async (email: string, password?: string): Promise<boolean> => {
        if (!email || !password) return false;

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                console.error('Login error:', error.message);
                return false;
            }

            if (data.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                setCurrentUser({
                    _id: data.user.id,
                    name: profile?.name || data.user.email?.split('@')[0] || 'User',
                    email: data.user.email || '',
                    isAdmin: profile?.is_admin || false,
                    token: data.session?.access_token || '',
                });
                return true;
            }
            return false;
        } catch (error) {
            console.error('Login error:', error);
            return false;
        }
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
            setCurrentUser(null);
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const register = async (name: string, email: string, password?: string): Promise<boolean | string> => {
        if (!name || !email || !password) return 'Please fill all fields';

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: name,
                    },
                    emailRedirectTo: window.location.origin
                }
            });

            if (error) {
                console.error('Registration error:', error.message);
                return error.message;
            }

            // Check if email confirmation is required
            if (data.user && !data.session) {
                // User created but needs to confirm email
                return 'confirm_email';
            }

            if (data.user && data.session) {
                // Profile will be created automatically by the trigger
                setCurrentUser({
                    _id: data.user.id,
                    name: name,
                    email: data.user.email || '',
                    isAdmin: false,
                    token: data.session.access_token || '',
                });
                return true;
            }
            return 'Registration failed. Please try again.';
        } catch (error: any) {
            console.error('Registration error:', error);
            return error.message || 'Registration failed';
        }
    };
    
    const value = { currentUser, login, logout, register };

    // Show nothing while checking auth state
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-light">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            </div>
        );
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const useAuth = () => useContext(AuthContext) as AuthContextType;

// --- REUSABLE COMPONENTS ---
const Logo: React.FC<{ variant?: 'dark' | 'light' }> = ({ variant = 'dark' }) => {
    // Using high-res thumbnail link to avoid Google Drive quota limits while maintaining quality
    
    // Header Logo ID (Default)
    const headerLogoId = "1KnVtcKPdwHrQgf0WPO58b3fH4oOPT64D";
    // Footer Logo ID (For dark backgrounds)
    const footerLogoId = "1zFw7cJFW6y-q2yNRhieFKenrXdUDTuN0";

    const logoId = variant === 'light' ? footerLogoId : headerLogoId;
    const logoUrl = `https://drive.google.com/thumbnail?id=${logoId}&sz=w1000`;

    return (
        <div className="flex items-center justify-start select-none">
            <img 
                src={logoUrl} 
                alt="Skardu Organics" 
                className={`h-16 md:h-20 w-auto object-contain transition-all duration-300`}
            />
        </div>
    );
};

const Header = ({ setRoute, route, onCartClick, searchQuery, setSearchQuery }: { setRoute: (route: string) => void; route: string; onCartClick: () => void; searchQuery: string; setSearchQuery: (query: string) => void; }) => {
    const { cartCount } = useCart();
    const { currentUser, logout } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [searchActive, setSearchActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
const [userMenuOpen, setUserMenuOpen] = useState(false);
const userMenuRef = useRef<HTMLDivElement>(null);

// Close user menu when clicking outside
useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
            setUserMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);

    // Handle scroll effect
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Focus input when search is activated
    useEffect(() => {
        if (searchActive && inputRef.current) {
            inputRef.current.focus();
        }
    }, [searchActive]);
    
    const navLinks = [
        { name: 'Home', path: '#/' },
        { name: 'Shop', path: '#/shop' },
        { name: 'About', path: '#/about' },
        { name: 'Contact', path: '#/contact' },
    ];

    const handleLogout = () => {
        logout();
        setRoute('#/');
    };

    return (
        <>
            <header 
                className={`fixed top-0 w-full z-50 transition-all duration-300 ${
                    scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm py-2' : 'bg-white/50 backdrop-blur-sm py-4'
                }`}
            >
                <div className="container mx-auto px-4 lg:px-8">
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <a 
                            href="#/" 
                            onClick={(e) => {e.preventDefault(); setRoute('#/');}} 
                            className="flex-shrink-0 z-50 cursor-pointer block"
                            aria-label="Skardu Organic Home"
                        >
                            <Logo variant="dark" />
                        </a>

                        {/* Desktop Nav */}
                        <nav className="hidden md:flex items-center space-x-8" aria-label="Main Navigation">
                            {navLinks.map(link => (
                                <a 
                                    key={link.name} 
                                    href={link.path} 
                                    onClick={(e) => {e.preventDefault(); setRoute(link.path);}} 
                                    className={`text-sm font-medium tracking-wide transition-all duration-200 hover:text-secondary relative group ${route === link.path ? 'text-primary font-bold' : 'text-gray-600'}`}
                                >
                                    {link.name}
                                    <span className={`absolute -bottom-1 left-0 w-0 h-0.5 bg-secondary transition-all duration-300 group-hover:w-full ${route === link.path ? 'w-full' : ''}`}></span>
                                </a>
                            ))}
                        </nav>

                        {/* Actions */}
                        <div className="flex items-center space-x-4 md:space-x-6">
                            {/* Desktop Search */}
                            <div className={`hidden md:flex items-center transition-all duration-300 ${searchActive ? 'w-80' : 'w-8'}`}>
                                {searchActive ? (
                                    <div className="relative w-full animate-fade-in">
                                        <input
                                            ref={inputRef}
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            onBlur={() => !searchQuery && setSearchActive(false)}
                                            onKeyDown={(e) => e.key === 'Enter' && setRoute('#/shop')}
                                            placeholder="Search 'oils for dry skin'..."
                                            aria-label="Search products"
                                            className="w-full pl-3 pr-8 py-1.5 text-sm border-b-2 border-primary bg-transparent focus:outline-none"
                                        />
                                        <button 
                                            onClick={() => { setSearchQuery(''); setSearchActive(false); }} 
                                            className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-500"
                                            aria-label="Clear search"
                                        >
                                            <XIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setSearchActive(true)} 
                                        className="text-gray-700 hover:text-primary transition-colors"
                                        aria-label="Toggle search"
                                    >
                                        <SearchIcon className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            <div className="hidden md:flex items-center">
                                {currentUser ? (
                                    <div className="relative" ref={userMenuRef}>
    <button 
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        className="flex items-center space-x-1 text-gray-700 hover:text-primary" 
        aria-label="User menu"
    >
        <UserIcon className="w-5 h-5" />
        <span className="text-sm font-medium">{currentUser.name.split(' ')[0]}</span>
    </button>
    {userMenuOpen && (
        <div className="absolute right-0 top-full mt-2 w-32 bg-white shadow-lg rounded-lg py-2">
            <button 
                onClick={() => { handleLogout(); setUserMenuOpen(false); }} 
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
                Logout
            </button>
        </div>
    )}
</div>
                                ) : (
                                     <a href="#/auth" onClick={(e) => {e.preventDefault(); setRoute('#/auth');}} className="text-gray-700 hover:text-primary" aria-label="Login or Sign up">
                                         <UserIcon className="w-5 h-5" />
                                     </a>
                                )}
                            </div>

                            <button onClick={onCartClick} className="relative text-gray-700 hover:text-primary transition-colors" aria-label="Shopping Cart">
                                <ShoppingCartIcon className="w-6 h-6" />
                                {cartCount > 0 && (
                                    <span className="absolute -top-2 -right-2 bg-secondary text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-sm animate-pulse">
                                        {cartCount}
                                    </span>
                                )}
                            </button>

                            {/* Mobile Menu Toggle */}
                            <button 
                                className="md:hidden text-gray-700 focus:outline-none" 
                                onClick={() => setIsMenuOpen(true)}
                                aria-label="Open menu"
                            >
                                <MenuIcon className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Mobile Fullscreen Menu */}
            <div className={`fixed inset-0 z-[60] bg-primary/95 backdrop-blur-xl transition-all duration-500 transform ${isMenuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full pointer-events-none'}`}>
                <div className="flex flex-col h-full p-6">
                    <div className="flex justify-between items-center mb-8">
                        <Logo variant="light" />
                        <button onClick={() => setIsMenuOpen(false)} className="text-white/80 hover:text-white p-2" aria-label="Close menu">
                            <XIcon className="w-8 h-8" />
                        </button>
                    </div>
                    
                    <div className="flex-grow flex flex-col justify-center space-y-6">
                        {navLinks.map((link, idx) => (
                            <a 
                                key={link.name} 
                                href={link.path} 
                                onClick={(e) => {e.preventDefault(); setRoute(link.path); setIsMenuOpen(false);}} 
                                className={`text-3xl font-serif font-medium text-center text-white transition-all duration-300 transform hover:scale-105 ${isMenuOpen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}
                                style={{ transitionDelay: `${idx * 100}ms` }}
                            >
                                {link.name}
                            </a>
                        ))}
                    </div>

                    <div className="mt-auto space-y-6">
                        <div className="relative">
                            <input
                                type="search"
                                placeholder="Search 'oils for dry skin'..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { setRoute('#/shop'); setIsMenuOpen(false); } }}
                                aria-label="Mobile search"
                                className="w-full bg-white/10 border border-white/20 rounded-full py-3 pl-12 pr-4 text-white placeholder-white/50 focus:outline-none focus:bg-white/20 transition-colors"
                            />
                            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/70" />
                        </div>
                        
                        {currentUser ? (
                            <div className="flex items-center justify-between text-white border-t border-white/10 pt-6">
                                <span className="font-medium">Hi, {currentUser.name}</span>
                                <button onClick={() => { handleLogout(); setIsMenuOpen(false); }} className="text-sm underline decoration-secondary underline-offset-4">Logout</button>
                            </div>
                        ) : (
                             <a href="#/auth" onClick={(e) => {e.preventDefault(); setRoute('#/auth'); setIsMenuOpen(false);}} className="flex items-center justify-center w-full bg-white text-primary py-3 rounded-lg font-bold">
                                Login / Sign Up
                             </a>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

const Footer = ({ setRoute }: { setRoute: (route: string) => void }) => {
    return (
        <footer className="bg-dark text-white pt-16 pb-8">
            <div className="container mx-auto px-4 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
                    <div className="space-y-4">
                        <Logo variant="light" />
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Harvested from the pristine valleys of Gilgit-Baltistan, Skardu Organics brings you the essence of purity. 100% organic, ethically sourced, and delivered with care.
                        </p>
                        <div className="flex space-x-4 pt-2">
                            {/* Social placeholders */}
                            <a href="#" aria-label="Facebook" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-secondary transition-colors cursor-pointer">f</a>
                            <a href="#" aria-label="LinkedIn" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-secondary transition-colors cursor-pointer">in</a>
                            <a href="#" aria-label="Instagram" className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-secondary transition-colors cursor-pointer">ig</a>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-lg font-serif font-semibold mb-6 text-secondary">Quick Links</h3>
                        <ul className="space-y-3 text-sm text-gray-400">
                            {['Shop', 'About Us', 'Contact', 'Refund Policy', 'Privacy Policy', 'Terms & Conditions'].map(item => {
                                const path = `#/` + item.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');
                                return (
                                    <li key={item}>
                                        <a href={path} onClick={(e) => {e.preventDefault(); setRoute(path);}} className="hover:text-white hover:pl-2 transition-all duration-300">
                                            {item}
                                        </a>
                                    </li>
                                )
                            })}
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-lg font-serif font-semibold mb-6 text-secondary">Contact Info</h3>
                        <ul className="space-y-4 text-sm text-gray-400">
                            <li className="flex items-start space-x-3">
                                <div className="mt-1 text-secondary"><SendIcon className="w-4 h-4" /></div>
                                <a href="mailto:support@skarduorganic.com" className="hover:text-white transition-colors">support@skarduorganic.com</a>
                            </li>
                            <li className="flex items-start space-x-3">
                                <div className="mt-1 text-secondary">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                </div>
                                <a href="tel:+923488875456" className="hover:text-white transition-colors">+92 348 887 5456</a>
                            </li>
                            <li className="flex items-start space-x-3">
                                <div className="mt-1 text-secondary"><TruckIcon className="w-4 h-4" /></div>
                                <span>Office 403, 4th floor, Building Park Lane, E 11/2 Islamabad</span>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-lg font-serif font-semibold mb-6 text-secondary">Newsletter</h3>
                        <p className="text-gray-400 text-sm mb-4">Subscribe for updates and exclusive offers.</p>
                        <form className="flex flex-col space-y-2" onSubmit={(e) => e.preventDefault()}>
                            <input 
                                type="email" 
                                placeholder="Your email address" 
                                aria-label="Email for newsletter"
                                className="bg-white/5 border border-white/10 rounded px-4 py-2 text-sm text-white focus:outline-none focus:border-secondary transition-colors" 
                            />
                            <button className="bg-secondary text-primary font-bold text-sm py-2 rounded hover:bg-white transition-colors">Subscribe</button>
                        </form>
                    </div>
                </div>
                
                <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-gray-500">
                    <p>&copy; {new Date().getFullYear()} Skardu Organics. All Rights Reserved.</p>
                    <div className="flex space-x-4 mt-4 md:mt-0">
                        <span>Privacy</span>
                        <span>Terms</span>
                        <span>Sitemap</span>
                    </div>
                </div>
            </div>
        </footer>
    );
};

const ProductCard: React.FC<{ product: Product, onProductSelect: (product: Product) => void; onAddToCart: () => void; }> = ({ product, onProductSelect, onAddToCart }) => {
    const { addToCart } = useCart();
    const { products } = useProducts();
    
    const currentProduct = products.find(p => p._id === product._id) || product;

    const handleAddToCartClick = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if (currentProduct.countInStock > 0) {
            addToCart(currentProduct, 1);
            onAddToCart();
        }
    };

    return (
        <div 
            role="button"
            tabIndex={0}
            onKeyDown={(e) => handleEnterOrSpace(e, () => onProductSelect(currentProduct))}
            onClick={() => onProductSelect(currentProduct)} 
            aria-label={`View details for ${currentProduct.name}`}
            className="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 cursor-pointer border border-gray-100 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
            {/* Image Container */}
            <div className="relative aspect-square overflow-hidden bg-gray-100">
                <img 
                    src={currentProduct.image} 
                    alt={currentProduct.name} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                />
                
                {/* Overlay Actions (Desktop) */}
                <div className="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 hidden md:block bg-gradient-to-t from-black/50 to-transparent pt-12">
                     {currentProduct.countInStock > 0 ? (
                        <button 
                            onClick={handleAddToCartClick}
                            aria-label={`Quick add ${currentProduct.name} to cart`}
                            className="w-full bg-white text-primary font-bold py-3 rounded-lg shadow-lg hover:bg-secondary hover:text-white transition-colors"
                        >
                            Quick Add
                        </button>
                     ) : (
                         <div className="w-full bg-gray-200 text-gray-500 font-bold py-3 rounded-lg text-center">Out of Stock</div>
                     )}
                </div>

                {/* Stock Badge */}
                {currentProduct.countInStock === 0 && (
                    <div className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        Sold Out
                    </div>
                )}
                 {currentProduct.countInStock > 0 && currentProduct.countInStock < 5 && (
                    <div className="absolute top-3 left-3 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        Low Stock
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="p-5">
                <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-1">{currentProduct.category}</div>
                <h3 className="font-serif text-lg font-semibold text-gray-900 mb-2 leading-tight line-clamp-2 group-hover:text-primary transition-colors h-12">
                    {currentProduct.name}
                </h3>
                
                <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-1">
                        <StarIcon className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm text-gray-500 font-medium">{currentProduct.rating}</span>
                    </div>
                    <div className="text-lg font-bold text-primary">
                        Rs {currentProduct.price.toLocaleString()}
                    </div>
                </div>

                {/* Mobile Add Button */}
                <div className="mt-4 md:hidden">
                    <button 
                         onClick={handleAddToCartClick}
                         disabled={currentProduct.countInStock === 0}
                         aria-label={`Add ${currentProduct.name} to cart`}
                         className="w-full py-2 border border-primary text-primary rounded-lg text-sm font-bold hover:bg-primary hover:text-white transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-primary"
                    >
                        {currentProduct.countInStock === 0 ? 'Sold Out' : 'Add to Cart'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CountdownTimer = () => {
    const [targetTime] = useState(Date.now() + 2 * 60 * 60 * 1000);

    const calculateTimeLeft = useCallback(() => {
        const difference = targetTime - Date.now();
        let timeLeft: {[key: string]: number} = {};

        if (difference > 0) {
            timeLeft = {
                hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
                minutes: Math.floor((difference / 1000 / 60) % 60),
                seconds: Math.floor((difference / 1000) % 60)
            };
        }
        return timeLeft;
    }, [targetTime]);
    
    const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

    useEffect(() => {
        const timer = setTimeout(() => {
            setTimeLeft(calculateTimeLeft());
        }, 1000);

        return () => clearTimeout(timer);
    });

    const timerComponents = Object.keys(timeLeft).map(interval => {
         if (!timeLeft[interval as keyof typeof timeLeft] && timeLeft[interval as keyof typeof timeLeft] !== 0) {
            return null;
        }
        return (
            <div key={interval} className="flex flex-col items-center mx-2 md:mx-4">
                <div className="text-3xl md:text-5xl font-bold font-serif bg-white/10 backdrop-blur-md w-16 h-16 md:w-20 md:h-20 flex items-center justify-center rounded-lg border border-white/20 shadow-lg">
                    {String(timeLeft[interval as keyof typeof timeLeft]).padStart(2, '0')}
                </div>
                <div className="text-[10px] md:text-xs uppercase tracking-widest mt-2 font-medium text-secondary">{interval}</div>
            </div>
        );
    });

    return (
        <div className="flex justify-center text-white" aria-label="Sale countdown timer">
            {timerComponents.length ? timerComponents : <span>Offer Expired</span>}
        </div>
    );
};

const CartSidebar: React.FC<{ isOpen: boolean; onClose: () => void; setRoute: (route: string) => void; }> = ({ isOpen, onClose, setRoute }) => {
    const { cartItems, cartTotal, updateQuantity, removeFromCart } = useCart();
    
    const handleCheckout = () => {
        onClose();
        setRoute('#/checkout');
    }

    return (
        <>
            {/* Backdrop */}
            <div 
                className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
                onClick={onClose}
            />
            
            {/* Sidebar */}
            <div 
                className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white shadow-2xl z-[110] transform transition-transform duration-500 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
                role="dialog"
                aria-modal="true"
                aria-label="Shopping Cart"
            >
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between p-6 border-b bg-light">
                        <h2 className="text-2xl font-serif font-bold text-primary">Shopping Cart</h2>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Close cart">
                            <XIcon className="w-6 h-6 text-gray-500" />
                        </button>
                    </div>

                    {cartItems.length > 0 ? (
                        <>
                            <div className="flex-grow overflow-y-auto p-6 space-y-6">
                                {cartItems.map(item => (
                                    <div key={item._id} className="flex gap-4 animate-fade-in">
                                        <div className="w-24 h-24 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-grow flex flex-col justify-between py-1">
                                            <div>
                                                <h4 className="font-semibold text-gray-900 line-clamp-2 leading-tight mb-1">{item.name}</h4>
                                                <p className="text-sm text-gray-500">Rs {item.price.toLocaleString()}</p>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center border border-gray-200 rounded-lg">
                                                    <button onClick={() => updateQuantity(item._id, item.quantity - 1)} className="p-1.5 hover:text-primary text-gray-500" aria-label="Decrease quantity"><MinusIcon className="w-4 h-4" /></button>
                                                    <span className="px-2 text-sm font-medium w-6 text-center" aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
                                                    <button onClick={() => updateQuantity(item._id, item.quantity + 1)} className="p-1.5 hover:text-primary text-gray-500" aria-label="Increase quantity"><PlusIcon className="w-4 h-4" /></button>
                                                </div>
                                                <button onClick={() => removeFromCart(item._id)} className="text-red-500 text-xs font-medium hover:underline" aria-label="Remove item">Remove</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-6 bg-light border-t shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                                <div className="space-y-2 mb-4 text-sm">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Subtotal</span>
                                        <span>Rs {cartTotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600">
                                        <span>Shipping</span>
                                        <span>{cartTotal > 2000 ? 'Free' : 'Calculated at next step'}</span>
                                    </div>
                                </div>
                                <div className="flex justify-between font-bold text-xl mb-6 text-primary">
                                    <span>Total</span>
                                    <span>Rs {cartTotal.toLocaleString()}</span>
                                </div>
                                <button onClick={handleCheckout} className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-secondary transition-colors shadow-lg">
                                    Proceed to Checkout
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-grow flex flex-col items-center justify-center text-center p-8">
                            <div className="w-32 h-32 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                <ShoppingCartIcon className="w-16 h-16 text-gray-300" />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-gray-900 mb-2">Your cart is empty</h3>
                            <p className="text-gray-500 max-w-xs mx-auto">Looks like you haven't discovered our organic treasures yet.</p>
                            <button onClick={onClose} className="mt-8 px-8 py-3 border-2 border-primary text-primary font-bold rounded-full hover:bg-primary hover:text-white transition-colors">
                                Start Shopping
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

const HeroSlider = ({ setRoute }: { setRoute: (route: string) => void; }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const timeoutRef = useRef<number | null>(null);

    const resetTimeout = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
    }, []);

    useEffect(() => {
        resetTimeout();
        timeoutRef.current = window.setTimeout(
            () => setCurrentIndex((prevIndex) => (prevIndex === HERO_SLIDES.length - 1 ? 0 : prevIndex + 1)),
            6000
        );
        return () => resetTimeout();
    }, [currentIndex, resetTimeout]);

    return (
        <section className="relative h-screen min-h-[600px] w-full overflow-hidden" aria-label="Hero Slider">
            {/* Slides */}
            {HERO_SLIDES.map((slide, index) => (
                <div
                    key={`slide-bg-${index}`}
                    className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out transform ${index === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}
                    style={{ backgroundImage: `url('${slide.imageUrl}')` }}
                >
                    <div className="absolute inset-0 bg-black/40 md:bg-black/30 bg-gradient-to-b from-black/60 via-transparent to-black/60" />
                </div>
            ))}
            
            {/* Content */}
            <div className="relative h-full container mx-auto px-4 flex items-center">
                <div className="max-w-3xl text-white pl-4 md:pl-12 border-l-4 border-secondary/80">
                    {HERO_SLIDES.map((slide, index) => (
                        <div key={index} className={`transition-all duration-1000 ease-out absolute top-1/2 -translate-y-1/2 pr-4 ${index === currentIndex ? 'opacity-100 translate-y-[-50%]' : 'opacity-0 translate-y-[-40%] pointer-events-none'}`}>
                            <span className="inline-block py-1 px-3 border border-white/30 rounded-full text-xs font-bold uppercase tracking-widest mb-4 bg-black/20 backdrop-blur-sm">Natural & Organic</span>
                            <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-bold leading-tight mb-6 drop-shadow-lg">
                                {slide.title}
                            </h1>
                            <p className="text-lg md:text-xl text-gray-200 mb-10 font-light max-w-lg leading-relaxed">
                                {slide.subtitle}
                            </p>
                            <button
                                onClick={() => setRoute('#/shop')}
                                className="group bg-secondary text-primary hover:bg-white hover:text-primary px-8 py-4 rounded-full font-bold text-lg transition-all duration-300 shadow-lg hover:shadow-2xl flex items-center gap-3"
                            >
                                {slide.buttonText}
                                <ChevronRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Indicators */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex space-x-3 z-20">
                {HERO_SLIDES.map((_, slideIndex) => (
                    <button
                        key={slideIndex}
                        onClick={() => setCurrentIndex(slideIndex)}
                        aria-label={`Go to slide ${slideIndex + 1}`}
                        className={`h-1.5 rounded-full transition-all duration-500 ${currentIndex === slideIndex ? 'bg-secondary w-8' : 'bg-white/50 w-4 hover:bg-white'}`}
                    />
                ))}
            </div>
        </section>
    );
};

const TestimonialsSection = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    return (
        <section className="relative py-28 bg-primary overflow-hidden isolate">
            {/* Background Pattern */}
             <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#C8A165_1px,transparent_1px)] [background-size:20px_20px]"></div>

            <div className="container mx-auto px-4 text-center relative z-10">
                <span className="text-secondary font-bold tracking-[0.2em] text-xs uppercase mb-4 block">Voices of Trust</span>
                <h2 className="text-4xl md:text-5xl font-serif font-bold text-white mb-16">Loved by Nature Lovers</h2>
                
                <div className="max-w-4xl mx-auto relative">
                    <div className="relative overflow-hidden min-h-[300px] md:min-h-[250px]">
                         {TESTIMONIALS.map((testimonial, index) => (
                             <div 
                                key={index}
                                className={`absolute inset-0 transition-all duration-700 ease-out flex flex-col items-center justify-center ${index === currentIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
                            >
                                <div className="mb-8 text-secondary">
                                    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21L14.017 18C14.017 16.896 14.325 16.053 14.941 15.471C15.557 14.89 16.604 14.5 18.082 14.3V9.49902C15.445 9.84902 13.666 10.649 12.745 11.9C11.824 13.151 11.397 15.295 11.464 18.332L11.531 21H14.017ZM5.583 21L5.583 18C5.583 16.896 5.891 16.053 6.507 15.471C7.123 14.89 8.17 14.5 9.648 14.3V9.49902C7.011 9.84902 5.232 10.649 4.311 11.9C3.39 13.151 2.963 15.295 3.03 18.332L3.097 21H14.017Z" /></svg>
                                </div>
                                <p className="text-xl md:text-3xl font-serif text-white/90 italic leading-relaxed max-w-3xl mb-8">
                                    "{testimonial.quote}"
                                </p>
                                <div className="flex items-center space-x-4">
                                    <div className="w-12 h-1 rounded-full bg-secondary"></div>
                                    <div className="text-left">
                                        <h4 className="font-bold text-white text-lg">{testimonial.name}</h4>
                                        <p className="text-white/50 text-sm">{testimonial.location}</p>
                                    </div>
                                </div>
                            </div>
                         ))}
                    </div>

                    <div className="flex justify-center gap-3 mt-12">
                        {TESTIMONIALS.map((_, idx) => (
                            <button 
                                key={idx}
                                onClick={() => setCurrentIndex(idx)}
                                className={`h-2 rounded-full transition-all duration-500 ${idx === currentIndex ? 'w-8 bg-secondary' : 'w-2 bg-white/20 hover:bg-white/40'}`}
                                aria-label={`Go to testimonial ${idx + 1}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

const ValuesSection = () => {
    const values = [
        { Icon: ShieldCheckIcon, title: 'No Preservatives', desc: 'Fresh from nature' },
        { Icon: LeafIcon, title: '100% Natural', desc: 'Pure organic goodness' },
        { Icon: MountainIcon, title: 'Sourced in GB', desc: 'Gilgit-Baltistan origin' },
        { Icon: HandHeartIcon, title: 'Handmade', desc: 'Crafted with care' },
        { Icon: PureDropIcon, title: 'No Additives', desc: 'Nothing artificial' },
        { Icon: HistoryIcon, title: 'Authentic', desc: 'Traditional heritage' },
    ];

    return (
        <section className="py-24 bg-[#fcfbf9]">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
                    {values.map(({ Icon, title, desc }, index) => (
                        <div key={index} className="group flex flex-col items-center text-center">
                            <div className="w-24 h-24 rounded-full bg-white border border-[#E5E0D8] group-hover:border-secondary group-hover:bg-secondary/10 flex items-center justify-center mb-6 transition-all duration-500 shadow-[0_4px_20px_rgba(0,0,0,0.03)] group-hover:shadow-[0_8px_30px_rgba(200,161,101,0.15)] transform group-hover:-translate-y-2">
                                <Icon className="w-10 h-10 text-primary/70 group-hover:text-primary transition-colors duration-500" />
                            </div>
                            <h3 className="font-serif font-bold text-lg text-gray-900 mb-2 group-hover:text-primary transition-colors">{title}</h3>
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

// --- PAGE COMPONENTS ---

const AboutPage = ({ setRoute }: { setRoute: (route: string) => void }) => {
    return (
        <div className="bg-light pt-28 pb-20">
            <div className="container mx-auto px-4 lg:px-8 space-y-24">
                
                {/* Section 1: Intro */}
                <div className="flex flex-col lg:flex-row items-center gap-12 animate-fade-in">
                    <div className="w-full lg:w-1/2 relative group">
                        <div className="absolute inset-0 bg-secondary/10 transform translate-x-4 translate-y-4 rounded-2xl transition-transform duration-500 group-hover:translate-x-2 group-hover:translate-y-2"></div>
                        <img 
                            src="https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&q=80&w=1000" 
                            alt="Skardu Tea" 
                            className="relative rounded-2xl shadow-xl w-full object-cover aspect-[4/3] transition-transform duration-700 group-hover:scale-[1.02]"
                        />
                    </div>
                    <div className="w-full lg:w-1/2 space-y-6">
                        <span className="text-secondary font-bold tracking-widest text-sm uppercase">About Us</span>
                        <h2 className="text-3xl md:text-4xl font-serif font-bold text-primary leading-tight">
                            Welcome to Skardu Naturals - Your Gateway to the Pristine Harvests of Gilgit Baltistan!
                        </h2>
                        <p className="text-gray-600 leading-relaxed text-lg">
                            At Skardu Naturals, we celebrate the natural bounty of Gilgit Baltistan, a region nestled in the heart of the Himalayas. Inspired by the rich agricultural heritage and the timeless practices of local farmers, we embarked on a journey to bring the finest organics to your doorstep.
                        </p>
                        <p className="text-gray-600 leading-relaxed text-lg">
                            Our story begins with a deep appreciation for the unspoiled landscapes of Gilgit Baltistan, where generations have cultivated the land with love and respect for nature. It is this very ethos that forms the foundation of Skardu Naturals.
                        </p>
                    </div>
                </div>

                {/* Section 2: Mission & Vision */}
                <div className="flex flex-col lg:flex-row-reverse items-center gap-12 animate-slide-up">
                    <div className="w-full lg:w-1/2 relative group">
                        <div className="absolute inset-0 bg-primary/10 transform -translate-x-4 translate-y-4 rounded-2xl transition-transform duration-500 group-hover:-translate-x-2 group-hover:translate-y-2"></div>
                        <img 
                            src="https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&q=80&w=1000"
                            alt="Walnuts and Dry Fruits" 
                            className="relative rounded-2xl shadow-xl w-full object-cover aspect-[4/3] transition-transform duration-700 group-hover:scale-[1.02]"
                        />
                    </div>
                    <div className="w-full lg:w-1/2 space-y-8">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:border-secondary/50 transition-colors duration-300">
                            <h3 className="text-2xl font-serif font-bold text-primary mb-4 pb-2 border-b border-gray-100">Our Mission</h3>
                            <p className="text-gray-600 leading-relaxed">
                                To provide 100% natural, pure, and authentic products sourced from the pristine valleys of Skardu. We aim to promote a healthier lifestyle by delivering nature's goodness in its purest form, free from harmful chemicals and additives.
                            </p>
                        </div>
                        
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:border-secondary/50 transition-colors duration-300">
                            <h3 className="text-2xl font-serif font-bold text-primary mb-4 pb-2 border-b border-gray-100">Our Vision</h3>
                            <p className="text-gray-600 leading-relaxed">
                                To become a trusted global brand for natural wellness, representing the richness of Gilgit-Baltistan's heritage and empowering people to embrace a healthier, more sustainable way of living.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Section 3: Essence */}
                <div className="flex flex-col lg:flex-row items-center gap-12 animate-slide-up">
                    <div className="w-full lg:w-1/2 relative group">
                        <div className="absolute inset-0 bg-secondary/10 transform translate-x-4 translate-y-4 rounded-2xl transition-transform duration-500 group-hover:translate-x-2 group-hover:translate-y-2"></div>
                        <img 
                            src="https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=1000"
                            alt="Dried Fruits Mix" 
                            className="relative rounded-2xl shadow-xl w-full object-cover aspect-[4/3] transition-transform duration-700 group-hover:scale-[1.02]"
                        />
                    </div>
                    <div className="w-full lg:w-1/2 space-y-6">
                        <h2 className="text-3xl md:text-4xl font-serif font-bold text-primary mb-4">
                            The Essence of Gilgit Baltistan
                        </h2>
                        <p className="text-gray-600 leading-relaxed text-lg mb-8">
                            We are passionate about promoting sustainable agriculture and supporting local farmers who have been the stewards of this land for centuries. Our commitment to organic farming practices ensures that each product you find on our platform is free from harmful chemicals, pesticides, and genetically modified organisms.
                        </p>
                        
                        <div className="space-y-6">
                            {[
                                { title: "Connecting Communities", desc: "Skardu Naturals is not just an online marketplace; it is a bridge that connects you directly to the vibrant communities of Gilgit Baltistan. With every purchase, you contribute to the prosperity of local farmers, their families, and the preservation of traditional farming practices." },
                                { title: "Purity & Sustainability", desc: "We source only the purest organic products directly from local farmers. We strive to minimize our environmental impact and promote sustainable farming." },
                                { title: "Transparency", desc: "From farm to your doorstep, we maintain transparency in every step of the process." }
                            ].map((item, i) => (
                                <div key={i} className="flex gap-4 group">
                                    <div className="flex-shrink-0 mt-1 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                                        <LeafIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-lg mb-1">{item.title}</h4>
                                        <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

const HomePage = ({ products, setRoute, onProductSelect, onAddToCart }: { products: Product[]; setRoute: (route: string) => void; onProductSelect: (product: Product) => void; onAddToCart: () => void; }) => {
    const shilajitProducts = products.filter(p => p.category === 'Shilajit').slice(0, 3);
    const dryFruitProducts = products.filter(p => p.category === 'Dry Fruits').slice(0, 3);
    
    return (
        <div className="bg-light">
            <HeroSlider setRoute={setRoute} />

            {/* Category Highlights */}
            <section className="py-20 container mx-auto px-4">
                <div className="text-center max-w-2xl mx-auto mb-16">
                    <span className="text-secondary font-bold tracking-widest text-sm uppercase">Our Collection</span>
                    <h2 className="text-4xl font-serif font-bold text-primary mt-2">Curated from the Mountains</h2>
                    <p className="text-gray-600 mt-4">Experience the unmatched purity of Gilgit-Baltistan. From the potent Shilajit to the sweetest apricots, every product tells a story of tradition.</p>
                </div>

                {/* Shilajit Highlight */}
                {shilajitProducts.length > 0 && (
                    <div className="mb-20">
                         <div className="flex justify-between items-end mb-8">
                            <h3 className="text-2xl font-serif font-bold text-gray-800">Premium Shilajit</h3>
                            <button onClick={() => setRoute('#/shop')} className="text-primary font-bold hover:text-secondary transition-colors flex items-center gap-1">View All <ChevronRightIcon className="w-4 h-4"/></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                            {shilajitProducts.map(p => <ProductCard key={p._id} product={p} onProductSelect={onProductSelect} onAddToCart={onAddToCart} />)}
                        </div>
                    </div>
                )}

                {/* Promo Banner - Buy 1 Get 1 Free */}
                <div 
                    className="relative rounded-3xl overflow-hidden my-20 shadow-2xl group cursor-pointer" 
                    onClick={() => setRoute('#/shop')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => handleEnterOrSpace(e, () => setRoute('#/shop'))}
                    aria-label="Promo banner: Buy 1 Get 1 Free on Shilajit products"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/95 to-primary/80" />
                    
                    <div className="relative z-10 flex flex-col md:flex-row items-center">
                        {/* Left Side - Text and Countdown */}
                        <div className="w-full md:w-1/2 p-8 md:p-16 text-white">
                            <span className="bg-secondary text-primary font-bold px-3 py-1 rounded text-xs uppercase tracking-wider mb-4 inline-block">Limited Time Offer</span>
                            <h2 className="text-4xl md:text-6xl font-serif font-bold mb-6">Buy 1, Get 1 <span className="text-secondary">FREE</span></h2>
                            <p className="text-lg md:text-xl text-gray-200 mb-8">On all organic Shilajit products. Boost your immunity naturally.</p>
                            <CountdownTimer />
                            <button className="mt-8 bg-white text-primary px-8 py-3 rounded-full font-bold hover:bg-secondary hover:text-white transition-all shadow-lg">
                                Shop Now
                            </button>
                        </div>
                        
                        {/* Right Side - Product Image */}
                        <div className="w-full md:w-1/2 flex items-center justify-center p-8">
                            <img 
                                src={BUY1_GET1_FREE_URL} 
                                alt="Buy 1 Get 1 Free Shilajit Offer" 
                                className="max-w-[280px] md:max-w-[320px] h-auto object-contain drop-shadow-2xl transform group-hover:scale-105 transition-transform duration-700"
                            />
                        </div>
                    </div>
                </div>

                {/* Dry Fruits Highlight */}
                 {dryFruitProducts.length > 0 && (
                    <div>
                         <div className="flex justify-between items-end mb-8">
                            <h3 className="text-2xl font-serif font-bold text-gray-800">Sun-Dried Fruits</h3>
                            <button onClick={() => setRoute('#/shop')} className="text-primary font-bold hover:text-secondary transition-colors flex items-center gap-1">View All <ChevronRightIcon className="w-4 h-4"/></button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                            {dryFruitProducts.map(p => <ProductCard key={p._id} product={p} onProductSelect={onProductSelect} onAddToCart={onAddToCart} />)}
                        </div>
                    </div>
                )}

                {/* Featured Product Section: Apricot Oil */}
                <div className="mt-24 bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-12">
                    <div className="w-full md:w-1/2">
                        <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50 flex items-center justify-center p-8">
                            <img 
                                src={PURE_APRICOT_OIL_URL} 
                                alt="Pure Apricot Oil" 
                                className="max-w-full max-h-full object-contain hover:scale-105 transition-transform duration-700 drop-shadow-xl" 
                            />
                        </div>
                    </div>
                    <div className="w-full md:w-1/2 space-y-6">
                        <span className="text-gray-500 font-medium tracking-wide text-sm">Nature’s Touch for Your Skin & Hair</span>
                        <h2 className="text-4xl md:text-5xl font-serif font-bold text-gray-900">Pure Apricot Oil</h2>
                        <p className="text-gray-600 leading-relaxed text-lg">
                            Experience the natural goodness of Pure Apricot Oil, packed with essential vitamins and antioxidants. It deeply nourishes your skin, leaving it soft, smooth, and radiant while also strengthening hair for a healthy shine. 100% natural and chemical-free, it’s the perfect choice for everyday care.
                        </p>
                        <button 
                            onClick={() => setRoute('#/shop')}
                            className="bg-primary text-white px-10 py-4 rounded-full font-bold text-sm tracking-wider hover:bg-secondary transition-all shadow-lg uppercase"
                        >
                            Explore Products
                        </button>
                    </div>
                </div>
            </section>

            <ValuesSection />
            <TestimonialsSection />
        </div>
    );
};

const ShopPage = ({ products, onProductSelect, onAddToCart }: { products: Product[]; onProductSelect: (product: Product) => void; onAddToCart: () => void; }) => {
    const [activeCategory, setActiveCategory] = useState('All');
    
    const categories = ['All', ...Array.from(new Set(products.map(p => p.category)))];
    // When search results are passed in 'products', we still allow filtering those results by category
    const filteredProducts = activeCategory === 'All' ? products : products.filter(p => p.category === activeCategory);

    return (
        <div className="bg-light min-h-screen pt-28 pb-20">
            <div className="container mx-auto px-4">
                <div className="text-center max-w-3xl mx-auto mb-12">
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-primary mb-4">Shop Our Products</h1>
                    <p className="text-gray-600">Explore our range of 100% organic and natural products sourced directly from nature.</p>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap justify-center gap-3 mb-12" role="tablist" aria-label="Product Categories">
                    {categories.map(cat => (
                        <button 
                            key={cat}
                            role="tab"
                            aria-selected={activeCategory === cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-6 py-2 rounded-full text-sm font-bold transition-all duration-300 ${activeCategory === cat ? 'bg-primary text-white shadow-lg scale-105' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
                        {filteredProducts.map(product => (
                            <ProductCard key={product._id} product={product} onProductSelect={onProductSelect} onAddToCart={onAddToCart} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white rounded-2xl shadow-sm">
                        <SearchIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h2 className="text-2xl font-semibold text-gray-700">No Products Found</h2>
                        <p className="text-gray-500 mt-2">Try adjusting your filters or search query.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const ProductDetailPage = ({ productId, setRoute, onAddToCart }: { productId: string; setRoute: (route: string) => void; onAddToCart: () => void; }) => {
    const { products, loading, addProductReview } = useProducts();
    const [product, setProduct] = useState<Product | null>(null);
    const [activeTab, setActiveTab] = useState('description');
    const { addToCart } = useCart();
    const [quantity, setQuantity] = useState(1);
    
    const [showNotifyInput, setShowNotifyInput] = useState(false);
    const [notifyEmail, setNotifyEmail] = useState('');
    const [notifySent, setNotifySent] = useState(false);

    // Review Form State
    const [reviewerName, setReviewerName] = useState('');
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [reviewSubmitted, setReviewSubmitted] = useState(false);
    
    useEffect(() => {
        setQuantity(1);
        setShowNotifyInput(false);
        setNotifySent(false);
        setNotifyEmail('');
        setReviewSubmitted(false);
        setReviewerName('');
        setRating(5);
        setComment('');
        
        if (!loading) {
            const foundProduct = products.find(p => p._id === productId);
            setProduct(foundProduct || null);
        }
    }, [productId, products, loading]);

    const handleNotifySubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (notifyEmail) {
            setNotifySent(true);
        }
    };

    const handleReviewSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (product) {
            addProductReview(product._id, { name: reviewerName, rating, comment });
            setReviewSubmitted(true);
            setReviewerName('');
            setRating(5);
            setComment('');
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center pt-20"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div></div>;
    if (!product) return <div className="pt-32 text-center">Product not found</div>;

    return (
        <div className="bg-white pt-28 pb-20">
            <div className="container mx-auto px-4 lg:px-8">
                {/* Breadcrumb */}
                <nav className="text-sm mb-8 text-gray-500" aria-label="Breadcrumb">
                    <a href="#/" onClick={(e) => {e.preventDefault(); setRoute('#/');}} className="hover:text-primary">Home</a>
                    <span className="mx-2">/</span>
                    <a href="#/shop" onClick={(e) => {e.preventDefault(); setRoute('#/shop');}} className="hover:text-primary">Shop</a>
                    <span className="mx-2">/</span>
                    <span className="text-primary font-medium" aria-current="page">{product.name}</span>
                </nav>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 xl:gap-16">
                    {/* Image Gallery */}
                    <div className="space-y-4">
                        <div className="aspect-square bg-gray-50 rounded-3xl overflow-hidden border border-gray-100 relative group">
                            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                             {product.countInStock === 0 && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><span className="bg-red-600 text-white px-6 py-2 rounded-full font-bold text-xl uppercase tracking-widest">Sold Out</span></div>}
                        </div>
                    </div>

                    {/* Product Info */}
                    <div className="flex flex-col h-full">
                        <span className="text-secondary font-bold tracking-widest text-sm uppercase mb-2">{product.category}</span>
                        <h1 className="text-3xl md:text-5xl font-serif font-bold text-primary mb-4 leading-tight">{product.name}</h1>
                        
                        <div className="flex items-center space-x-4 mb-6">
                            <div className="flex text-yellow-400" aria-label={`${product.rating} out of 5 stars`}>
                                {[...Array(5)].map((_, i) => (
                                    <StarIcon key={i} className={`w-5 h-5 ${i < Math.floor(product.rating) ? 'fill-current' : 'text-gray-200'}`} />
                                ))}
                            </div>
                            <span className="text-gray-500 text-sm">({product.numReviews} Reviews)</span>
                        </div>

                        <div className="text-3xl font-bold text-gray-900 mb-6">
                            Rs {product.price.toLocaleString()}
                        </div>

                        <p className="text-gray-600 leading-relaxed mb-8 text-lg font-light">
                            {product.description}
                        </p>

                        <div className="mt-auto bg-gray-50 p-6 rounded-2xl border border-gray-100">
                            {product.countInStock > 0 ? (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="font-bold text-gray-700" id="quantity-label">Quantity</span>
                                        <div className="flex items-center bg-white rounded-lg border border-gray-200 p-1" role="group" aria-labelledby="quantity-label">
                                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="p-2 hover:bg-gray-100 rounded" aria-label="Decrease quantity"><MinusIcon className="w-4 h-4 text-gray-600" /></button>
                                            <span className="w-12 text-center font-bold">{quantity}</span>
                                            <button onClick={() => setQuantity(q => Math.min(product.countInStock, q + 1))} className="p-2 hover:bg-gray-100 rounded" aria-label="Increase quantity"><PlusIcon className="w-4 h-4 text-gray-600" /></button>
                                        </div>
                                    </div>
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={() => { addToCart(product, quantity); onAddToCart(); }} 
                                            className="flex-1 bg-white border-2 border-primary text-primary py-3 rounded-xl font-bold text-lg hover:bg-primary hover:text-white transition-all"
                                        >
                                            Add to Cart
                                        </button>
                                        <button 
                                            onClick={() => { addToCart(product, quantity); setRoute('#/checkout'); }} 
                                            className="flex-1 bg-primary text-white py-3 rounded-xl font-bold text-lg hover:bg-secondary transition-all shadow-lg hover:shadow-xl"
                                        >
                                            Buy Now
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center">
                                    <p className="text-red-500 font-bold text-lg mb-4">Currently Out of Stock</p>
                                    {!showNotifyInput ? (
                                         <button 
                                            onClick={() => setShowNotifyInput(true)}
                                            className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold text-lg hover:bg-gray-800 transition-all"
                                        >
                                            Notify When Available
                                        </button>
                                    ) : !notifySent ? (
                                        <form onSubmit={handleNotifySubmit} className="flex gap-2">
                                            <input 
                                                type="email" 
                                                required 
                                                placeholder="Enter your email" 
                                                value={notifyEmail}
                                                onChange={(e) => setNotifyEmail(e.target.value)}
                                                className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-primary"
                                            />
                                            <button type="submit" className="bg-primary text-white px-6 py-3 rounded-lg font-bold hover:bg-secondary transition-colors">Send</button>
                                        </form>
                                    ) : (
                                        <div className="text-green-600 font-medium bg-green-50 py-3 rounded-lg">
                                            Thanks! We'll notify you when it's back.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs: Description & Reviews */}
                <div className="mt-20">
                    <div className="flex border-b border-gray-200 mb-8" role="tablist">
                        <button 
                            role="tab"
                            aria-selected={activeTab === 'description'}
                            onClick={() => setActiveTab('description')}
                            className={`pb-4 px-4 font-bold text-lg transition-all relative ${activeTab === 'description' ? 'text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Description
                            {activeTab === 'description' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary"></span>}
                        </button>
                        <button 
                            role="tab"
                            aria-selected={activeTab === 'reviews'}
                            onClick={() => setActiveTab('reviews')}
                            className={`pb-4 px-4 font-bold text-lg transition-all relative ${activeTab === 'reviews' ? 'text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Reviews ({product.numReviews})
                            {activeTab === 'reviews' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-primary"></span>}
                        </button>
                    </div>

                    <div className="animate-fade-in">
                        {activeTab === 'description' ? (
                            <div className="prose max-w-none text-gray-600 leading-relaxed">
                                <p>{product.description}</p>
                                <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">Why Choose Skardu Organics?</h3>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>100% Organic & Natural</li>
                                    <li>Sourced directly from Gilgit-Baltistan</li>
                                    <li>Free from preservatives and additives</li>
                                    <li>Ethically harvested</li>
                                </ul>
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Customer Reviews</h3>
                                    {product.reviews.length > 0 ? (
                                        product.reviews.map(review => (
                                            <div key={review._id} className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-bold text-gray-900">{review.name}</span>
                                                    <div className="flex text-yellow-400">
                                                         {[...Array(5)].map((_, i) => (
                                                            <StarIcon key={i} className={`w-4 h-4 ${i < review.rating ? 'fill-current' : 'text-gray-300'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-gray-600 text-sm mb-2">{review.comment}</p>
                                                <span className="text-xs text-gray-400">{new Date(review.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-gray-500 italic">No reviews yet. Be the first to review!</p>
                                    )}
                                </div>
                                
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-6">Write a Review</h3>
                                    {reviewSubmitted ? (
                                        <div className="bg-green-50 text-green-800 p-6 rounded-xl border border-green-100">
                                            <h4 className="font-bold mb-2">Thank you for your review!</h4>
                                            <p>Your feedback helps us improve and helps others make better choices.</p>
                                        </div>
                                    ) : (
                                        <form onSubmit={handleReviewSubmit} className="space-y-4 bg-gray-50 p-8 rounded-xl border border-gray-100">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Your Name</label>
                                                <input 
                                                    type="text" 
                                                    required
                                                    value={reviewerName}
                                                    onChange={(e) => setReviewerName(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-primary"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Rating</label>
                                                <select 
                                                    value={rating}
                                                    onChange={(e) => setRating(Number(e.target.value))}
                                                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-primary"
                                                >
                                                    <option value="5">5 - Excellent</option>
                                                    <option value="4">4 - Very Good</option>
                                                    <option value="3">3 - Good</option>
                                                    <option value="2">2 - Fair</option>
                                                    <option value="1">1 - Poor</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Review</label>
                                                <textarea 
                                                    required
                                                    rows={4}
                                                    value={comment}
                                                    onChange={(e) => setComment(e.target.value)}
                                                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-primary"
                                                ></textarea>
                                            </div>
                                            <button type="submit" className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-secondary transition-colors">
                                                Submit Review
                                            </button>
                                        </form>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const AuthPage = ({ setRoute }: { setRoute: (route: string) => void }) => {
    const { login, register } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        if (isLogin) {
            const success = await login(email, password);
            setLoading(false);
            if (success) {
                setRoute('#/');
            } else {
                setError('Login failed. Please check your email and password.');
            }
        } else {
            // Password validation
            if (password.length < 6) {
                setLoading(false);
                setError('Password must be at least 6 characters long.');
                return;
            }
            
            const result = await register(name, email, password);
            setLoading(false);
            
            if (result === true) {
                setRoute('#/');
            } else if (result === 'confirm_email') {
                setSuccessMessage('Account created! Please check your email to confirm your account before logging in.');
                setIsLogin(true);
                setName('');
                setPassword('');
            } else {
                setError(typeof result === 'string' ? result : 'Registration failed. Please try again.');
            }
        }
    };

    return (
        <div className="min-h-screen bg-light flex items-center justify-center py-20 px-4">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
                <div className="bg-primary p-8 text-center">
                    <h2 className="text-3xl font-serif font-bold text-white mb-2">{isLogin ? 'Welcome Back' : 'Join Skardu Organics'}</h2>
                    <p className="text-white/70">{isLogin ? 'Login to manage your orders' : 'Create an account to start shopping'}</p>
                </div>
                
                <div className="p-8">
                    {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-6 text-sm text-center font-medium border border-red-100">{error}</div>}
                    {successMessage && <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-6 text-sm text-center font-medium border border-green-100">{successMessage}</div>}
                    
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {!isLogin && (
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Full Name</label>
                                <div className="relative">
                                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                                    <input 
                                        type="text" 
                                        required={!isLogin}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                        placeholder="John Doe"
                                    />
                                </div>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
                            <div className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" /></svg>
                                <input 
                                    type="email" 
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
                            <div className="relative">
                                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-primary text-white py-3 rounded-xl font-bold text-lg hover:bg-secondary transition-all shadow-lg disabled:opacity-70"
                        >
                            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-gray-500 text-sm">
                            {isLogin ? "Don't have an account?" : "Already have an account?"}
                            <button 
                                onClick={() => setIsLogin(!isLogin)}
                                className="ml-2 text-primary font-bold hover:underline"
                            >
                                {isLogin ? 'Sign Up' : 'Login'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CheckoutPage = ({ setRoute }: { setRoute: (route: string) => void }) => {
    const { cartItems, cartTotal, checkoutClearCart } = useCart();
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({
        firstName: '', lastName: '', email: '', address: '', city: '', postalCode: '', phone: ''
    });
    const [shippingType, setShippingType] = useState<'standard' | 'express'>('standard');
    const [paymentMethod, setPaymentMethod] = useState('COD');
    const [loading, setLoading] = useState(false);
    const [orderPlaced, setOrderPlaced] = useState(false);
    const [orderId, setOrderId] = useState('');
    const [orderError, setOrderError] = useState('');
    const [emailStatus, setEmailStatus] = useState<'pending' | 'sent' | 'failed'>('pending');

    // Pre-fill email if user is logged in
    useEffect(() => {
        if (currentUser?.email) {
            setFormData(prev => ({ ...prev, email: currentUser.email }));
        }
    }, [currentUser]);

    // Calculate Shipping Cost
    const shippingCost = useMemo(() => {
        if (shippingType === 'express') return 500;
        return cartTotal > 2000 ? 0 : 200;
    }, [shippingType, cartTotal]);

    const finalTotal = cartTotal + shippingCost;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setOrderError('');
        
        const generatedOrderId = 'SO-' + Math.floor(100000 + Math.random() * 900000);
        
        try {
            // Prepare order data
            const orderData = {
                order_id: generatedOrderId,
                user_id: currentUser?._id || null,
                order_items: cartItems.map(item => ({
                    product_id: item._id,
                    name: item.name,
                    image: item.image,
                    price: item.price,
                    quantity: item.quantity
                })),
                shipping_address: {
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    address: formData.address,
                    city: formData.city,
                    postalCode: formData.postalCode,
                    phone: formData.phone,
                    country: 'Pakistan'
                },
                payment_method: paymentMethod,
                items_price: cartTotal,
                shipping_price: shippingCost,
                total_price: finalTotal,
                order_status: 'Processing',
                is_paid: paymentMethod !== 'COD',
                paid_at: paymentMethod !== 'COD' ? new Date().toISOString() : null
            };

            // Save order to Supabase
            const { data: savedOrder, error: orderSaveError } = await supabase
                .from('orders')
                .insert(orderData)
                .select()
                .single();

            if (orderSaveError) {
                console.error('Order save error:', orderSaveError);
                // Still proceed even if database save fails
            }

            // Send confirmation email via Edge Function
            let emailSent = false;
            try {
                const { data: emailData, error: emailError } = await supabase.functions.invoke('send-order-email', {
                    body: {
                        to: formData.email,
                        orderId: generatedOrderId,
                        customerName: `${formData.firstName} ${formData.lastName}`,
                        orderItems: cartItems.map(item => ({
                            name: item.name,
                            quantity: item.quantity,
                            price: item.price,
                            image: item.image
                        })),
                        shippingAddress: {
                            firstName: formData.firstName,
                            lastName: formData.lastName,
                            address: formData.address,
                            city: formData.city,
                            postalCode: formData.postalCode,
                            phone: formData.phone
                        },
                        shippingMethod: shippingType === 'express' ? 'Express Delivery (1-2 Days)' : 'Standard Delivery (4-5 Days)',
                        paymentMethod: paymentMethod,
                        subtotal: cartTotal,
                        shippingCost: shippingCost,
                        total: finalTotal,
                        sendAdminCopy: true
                    }
                });

                if (emailError) {
                    console.warn('Email sending failed:', emailError);
                } else {
                    emailSent = true;
                    console.log('Order confirmation email sent:', emailData);
                }
            } catch (emailErr) {
                console.warn('Email function error:', emailErr);
            }

            setOrderId(generatedOrderId);
            setOrderPlaced(true);
            setEmailStatus(emailSent ? 'sent' : 'failed');
            checkoutClearCart();
        } catch (error: any) {
            console.error('Checkout error:', error);
            setOrderError('An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Require login to checkout
    if (!currentUser) {
        return (
            <div className="min-h-screen bg-light flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-12 text-center border border-gray-100">
                    <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <UserIcon className="w-12 h-12 text-primary" />
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-primary mb-4">Login Required</h2>
                    <p className="text-gray-600 mb-8">Please sign in or create an account to complete your purchase. This helps us keep you updated on your order status.</p>
                    <div className="space-y-4">
                        <button 
                            onClick={() => setRoute('#/auth')} 
                            className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-secondary transition-all shadow-lg"
                        >
                            Sign In / Sign Up
                        </button>
                        <button 
                            onClick={() => setRoute('#/shop')} 
                            className="w-full text-gray-500 py-2 font-medium hover:text-primary transition-colors"
                        >
                            Continue Shopping
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (orderPlaced) {
        return (
            <div className="min-h-screen bg-light flex items-center justify-center p-4">
                <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl p-12 text-center border border-gray-100">
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShieldCheckIcon className="w-12 h-12 text-green-600" />
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-primary mb-4">Order Placed Successfully!</h2>
                    <p className="text-gray-600 mb-2">Thank you for your purchase. Your order <span className="font-bold text-primary">#{orderId}</span> has been confirmed.</p>
                    
                    {/* Email Status */}
                    {emailStatus === 'sent' ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-green-700 flex items-center justify-center gap-2">
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                Confirmation email sent to <span className="font-medium">{formData.email}</span>
                            </p>
                        </div>
                    ) : (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-amber-700">
                                📧 We couldn't send the confirmation email, but don't worry - your order is confirmed! 
                                Please save your order number: <span className="font-bold">#{orderId}</span>
                            </p>
                        </div>
                    )}
                    
                    <p className="text-sm text-gray-500 mb-6">
                        <span className="font-medium">Shipping:</span> {shippingType === 'express' ? 'Express Delivery (1-2 Days)' : 'Standard Delivery (4-5 Days)'}
                    </p>
                    
                    {/* WhatsApp Support */}
                    <div className="bg-gray-50 rounded-xl p-4 mb-6">
                        <p className="text-sm text-gray-600 mb-2">Need help with your order?</p>
                        <a 
                            href={`https://wa.me/923488875456?text=Hi! I just placed order ${orderId} and have a question.`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-green-600 font-medium hover:text-green-700"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            Contact us on WhatsApp
                        </a>
                    </div>
                    
                    <button onClick={() => setRoute('#/')} className="bg-primary text-white px-8 py-3 rounded-full font-bold hover:bg-secondary transition-all">
                        Continue Shopping
                    </button>
                </div>
            </div>
        );
    }

    if (cartItems.length === 0) {
        return (
            <div className="min-h-screen bg-light flex items-center justify-center">
                 <div className="text-center">
                    <h2 className="text-2xl font-bold text-gray-700 mb-4">Your cart is empty</h2>
                    <button onClick={() => setRoute('#/shop')} className="text-primary underline font-bold">Go to Shop</button>
                 </div>
            </div>
        );
    }

    return (
        <div className="bg-light min-h-screen pt-28 pb-20">
            <div className="container mx-auto px-4 lg:px-8">
                 <h1 className="text-3xl font-serif font-bold text-primary mb-8 text-center">Checkout</h1>
                 
                 {orderError && (
                    <div className="max-w-2xl mx-auto mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-center">
                        {orderError}
                    </div>
                 )}
                 
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                     {/* Form */}
                     <div>
                         <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 mb-8">
                             <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                 <UserIcon className="w-5 h-5 text-secondary" />
                                 Contact Information
                                 <span className="ml-auto text-sm font-normal text-green-600">✓ Logged in as {currentUser.name}</span>
                             </h2>
                             <form id="checkout-form" onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                                 <div>
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">First Name</label>
                                     <input type="text" name="firstName" required value={formData.firstName} className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary" onChange={handleInputChange} />
                                 </div>
                                 <div>
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Last Name</label>
                                     <input type="text" name="lastName" required value={formData.lastName} className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary" onChange={handleInputChange} />
                                 </div>
                                 <div className="col-span-2">
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
                                     <input type="email" name="email" required value={formData.email} className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary bg-gray-50" onChange={handleInputChange} />
                                 </div>
                                 <div className="col-span-2">
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                                     <input type="tel" name="phone" required value={formData.phone} className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary" onChange={handleInputChange} />
                                 </div>
                                 <div className="col-span-2">
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Address</label>
                                     <input type="text" name="address" required value={formData.address} className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary" onChange={handleInputChange} />
                                 </div>
                                 <div>
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">City</label>
                                     <input type="text" name="city" required value={formData.city} className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary" onChange={handleInputChange} />
                                 </div>
                                 <div>
                                     <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Postal Code</label>
                                     <input type="text" name="postalCode" required value={formData.postalCode} className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:border-primary" onChange={handleInputChange} />
                                 </div>
                             </form>
                         </div>

                         {/* Shipping Method Section */}
                         <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                             <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                 <TruckIcon className="w-5 h-5 text-secondary" />
                                 Shipping Method
                             </h2>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div 
                                    onClick={() => setShippingType('standard')}
                                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between h-32 ${shippingType === 'standard' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                                 >
                                     <div className="flex justify-between items-start">
                                         <span className="font-bold text-gray-900">Standard</span>
                                         {shippingType === 'standard' && <div className="w-4 h-4 rounded-full bg-primary"></div>}
                                     </div>
                                     <div className="text-sm text-gray-500">4-5 Business Days</div>
                                     <div className="font-bold text-primary">{cartTotal > 2000 ? 'Free' : 'Rs 200'}</div>
                                 </div>
                                 <div 
                                    onClick={() => setShippingType('express')}
                                    className={`cursor-pointer p-4 rounded-xl border-2 transition-all flex flex-col justify-between h-32 ${shippingType === 'express' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                                 >
                                     <div className="flex justify-between items-start">
                                         <span className="font-bold text-gray-900">Express</span>
                                         {shippingType === 'express' && <div className="w-4 h-4 rounded-full bg-primary"></div>}
                                     </div>
                                     <div className="text-sm text-gray-500">1-2 Business Days</div>
                                     <div className="font-bold text-primary">Rs 500</div>
                                 </div>
                             </div>
                         </div>
                     </div>

                     {/* Order Summary */}
                     <div>
                         <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 sticky top-28">
                             <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                                 <ShoppingCartIcon className="w-5 h-5 text-secondary" />
                                 Order Summary
                             </h2>
                             <div className="space-y-4 max-h-80 overflow-y-auto mb-6 pr-2 scrollbar-thin">
                                 {cartItems.map(item => (
                                     <div key={item._id} className="flex gap-4">
                                         <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                             <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                                         </div>
                                         <div className="flex-grow">
                                             <h4 className="text-sm font-bold text-gray-900 line-clamp-1">{item.name}</h4>
                                             <p className="text-xs text-gray-500">Qty: {item.quantity} x Rs {item.price.toLocaleString()}</p>
                                         </div>
                                         <div className="text-sm font-bold text-gray-900">
                                             Rs {(item.price * item.quantity).toLocaleString()}
                                         </div>
                                     </div>
                                 ))}
                             </div>
                             
                             <div className="border-t border-gray-100 pt-4 space-y-2">
                                 <div className="flex justify-between text-gray-600">
                                     <span>Subtotal</span>
                                     <span>Rs {cartTotal.toLocaleString()}</span>
                                 </div>
                                 <div className="flex justify-between text-gray-600">
                                     <span>Shipping ({shippingType === 'standard' ? 'Standard' : 'Express'})</span>
                                     <span className={shippingCost === 0 ? "text-green-600 font-medium" : "text-gray-900"}>
                                         {shippingCost === 0 ? 'Free' : `Rs ${shippingCost}`}
                                     </span>
                                 </div>
                                 <div className="flex justify-between text-xl font-bold text-primary pt-2">
                                     <span>Total</span>
                                     <span>Rs {finalTotal.toLocaleString()}</span>
                                 </div>
                             </div>

                             <div className="mt-6 space-y-3">
                                <h3 className="font-bold text-gray-900 text-sm uppercase mb-2">Payment Method</h3>
                                 <div className="flex flex-col gap-3">
                                     <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:border-primary transition-colors">
                                         <input type="radio" name="payment" value="COD" checked={paymentMethod === 'COD'} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-primary" />
                                         <TruckIcon className="w-5 h-5 text-gray-600" />
                                         <span className="text-sm font-medium text-gray-700">Cash on Delivery (COD)</span>
                                     </label>
                                     <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:border-primary transition-colors">
                                         <input type="radio" name="payment" value="EasyPaisa" checked={paymentMethod === 'EasyPaisa'} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-primary" />
                                         <SmartphoneIcon className="w-5 h-5 text-gray-600" />
                                         <span className="text-sm font-medium text-gray-700">EasyPaisa</span>
                                     </label>
                                     <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg bg-gray-50 cursor-pointer hover:border-primary transition-colors">
                                         <input type="radio" name="payment" value="JazzCash" checked={paymentMethod === 'JazzCash'} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-primary" />
                                         <CreditCardIcon className="w-5 h-5 text-gray-600" />
                                         <span className="text-sm font-medium text-gray-700">JazzCash</span>
                                     </label>
                                 </div>
                             </div>

                             <button 
                                form="checkout-form"
                                type="submit" 
                                disabled={loading}
                                className="w-full mt-8 bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-secondary transition-all shadow-lg disabled:opacity-70 flex justify-center"
                             >
                                 {loading ? <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" /> : `Pay Rs ${finalTotal.toLocaleString()}`}
                             </button>
                         </div>
                     </div>
                 </div>
            </div>
        </div>
    );
};

const ContactPage = ({ setRoute }: { setRoute: (route: string) => void }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        subject: '',
        message: ''
    });
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('submitting');
        // Simulate API call
        setTimeout(() => {
            setStatus('success');
            setFormData({ name: '', email: '', subject: '', message: '' });
        }, 1500);
    };

    return (
        <div className="bg-light pt-28 pb-20">
            <div className="container mx-auto px-4 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-16 animate-fade-in">
                    <span className="text-secondary font-bold tracking-widest text-sm uppercase">Get in Touch</span>
                    <h1 className="text-4xl md:text-5xl font-serif font-bold text-primary mt-2 mb-6">We'd Love to Hear from You</h1>
                    <p className="text-gray-600 text-lg">Have a question about our organic products or your order? Fill out the form below and our team will get back to you within 24 hours.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    {/* Contact Info Cards */}
                    <div className="lg:col-span-1 space-y-6 animate-slide-up">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
                                <SendIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Email Us</h3>
                            <p className="text-gray-500 mb-4 text-sm">For general inquiries and support.</p>
                            <a href="mailto:support@skarduorganic.com" className="text-primary font-bold hover:text-secondary transition-colors">support@skarduorganic.com</a>
                        </div>

                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
                                <SmartphoneIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Call Us</h3>
                            <p className="text-gray-500 mb-4 text-sm">Mon-Fri from 9am to 6pm.</p>
                            <a href="tel:+923488875456" className="text-primary font-bold hover:text-secondary transition-colors">+92 348 887 5456</a>
                        </div>

                         <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
                            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6">
                                <TruckIcon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Visit Us</h3>
                            <p className="text-gray-500 text-sm">Office 403, 4th floor, Building Park Lane,<br/>E 11/2 Islamabad</p>
                        </div>
                    </div>

                    {/* Contact Form */}
                    <div className="lg:col-span-2 animate-slide-up" style={{ animationDelay: '0.2s' }}>
                        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-lg border border-gray-100">
                            {status === 'success' ? (
                                <div className="text-center py-12">
                                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <ShieldCheckIcon className="w-10 h-10 text-green-600" />
                                    </div>
                                    <h2 className="text-3xl font-serif font-bold text-primary mb-4">Message Sent!</h2>
                                    <p className="text-gray-600 mb-8">Thank you for contacting us. We have received your message and will respond shortly.</p>
                                    <button onClick={() => setStatus('idle')} className="text-primary font-bold underline">Send another message</button>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label htmlFor="name" className="block text-sm font-bold text-gray-700 mb-2">Your Name</label>
                                            <input 
                                                type="text" 
                                                id="name" 
                                                name="name"
                                                required
                                                value={formData.name}
                                                onChange={handleChange}
                                                placeholder="John Doe"
                                                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-gray-50 transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">Email Address</label>
                                            <input 
                                                type="email" 
                                                id="email" 
                                                name="email"
                                                required
                                                value={formData.email}
                                                onChange={handleChange}
                                                placeholder="john@example.com"
                                                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-gray-50 transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="subject" className="block text-sm font-bold text-gray-700 mb-2">Subject</label>
                                        <div className="relative">
                                            <select 
                                                id="subject" 
                                                name="subject"
                                                required
                                                value={formData.subject}
                                                onChange={handleChange}
                                                className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-gray-50 appearance-none transition-all"
                                            >
                                                <option value="" disabled>Select a topic</option>
                                                <option value="Order Inquiry">Order Inquiry</option>
                                                <option value="Product Question">Product Question</option>
                                                <option value="Wholesale">Wholesale/Bulk Order</option>
                                                <option value="Feedback">Feedback</option>
                                                <option value="Other">Other</option>
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none">
                                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="message" className="block text-sm font-bold text-gray-700 mb-2">Message</label>
                                        <textarea 
                                            id="message" 
                                            name="message"
                                            required
                                            rows={6}
                                            value={formData.message}
                                            onChange={handleChange}
                                            placeholder="How can we help you?"
                                            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-gray-50 resize-none transition-all"
                                        ></textarea>
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={status === 'submitting'}
                                        className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg hover:bg-secondary transition-all shadow-lg disabled:opacity-70 flex justify-center items-center gap-2"
                                    >
                                        {status === 'submitting' ? (
                                            <>
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                                                Sending...
                                            </>
                                        ) : (
                                            <>
                                                Send Message
                                                <SendIcon className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


// --- MAIN APP ---
export default function App() {
    const [route, setRoute] = useState('#/');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const handleHashChange = () => {
            setRoute(window.location.hash || '#/');
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    // Reset scroll on route change
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [route]);

    const handleProductSelect = (product: Product) => {
        setSelectedProduct(product);
        setRoute(`#/product/${product._id}`);
    };

    return (
        <AuthProvider>
            <ProductProvider>
                <CartProvider>
                    <AppContent 
                        route={route} 
                        setRoute={setRoute} 
                        selectedProduct={selectedProduct} 
                        setSelectedProduct={setSelectedProduct}
                        isCartOpen={isCartOpen}
                        setIsCartOpen={setIsCartOpen}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        handleProductSelect={handleProductSelect}
                    />
                </CartProvider>
            </ProductProvider>
        </AuthProvider>
    );
}

const AppContent = ({ 
    route, setRoute, selectedProduct, setSelectedProduct, isCartOpen, setIsCartOpen, searchQuery, setSearchQuery, handleProductSelect 
}: any) => {
    const { products, loading, error } = useProducts();

    // Helper to get clean route ID
    const getProductIdFromRoute = () => {
        const match = route.match(/#\/product\/(.+)/);
        return match ? match[1] : null;
    };

    const activeProductId = getProductIdFromRoute();

    // --- Filter Products based on Search ---
    // If we are on the Shop page, we pass all products, but maybe we want to filter them if a search query exists?
    // Let's implement global search filtering here or pass query to ShopPage.
    // For simplicity, let's pre-filter products if query exists and pass to pages.
    const displayedProducts = useMemo(() => {
        return performAdvancedSearch(products, searchQuery);
    }, [products, searchQuery]);


    const renderPage = () => {
        if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary"></div></div>;
        if (error) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;

        if (route === '#/' || route === '') {
            return <HomePage products={displayedProducts} setRoute={setRoute} onProductSelect={handleProductSelect} onAddToCart={() => setIsCartOpen(true)} />;
        }
        if (route === '#/shop') {
            return <ShopPage products={displayedProducts} onProductSelect={handleProductSelect} onAddToCart={() => setIsCartOpen(true)} />;
        }
        if (route === '#/about') {
             return <AboutPage setRoute={setRoute} />;
        }
        if (route === '#/contact') {
             return <ContactPage setRoute={setRoute} />;
        }
        if (activeProductId) {
            return <ProductDetailPage productId={activeProductId} setRoute={setRoute} onAddToCart={() => setIsCartOpen(true)} />;
        }
        if (route === '#/auth') {
            return <AuthPage setRoute={setRoute} />;
        }
        if (route === '#/checkout') {
            return <CheckoutPage setRoute={setRoute} />;
        }
        // Fallback for About/Contact pages
        return (
            <div className="min-h-screen bg-light pt-32 px-8 text-center">
                <h1 className="text-4xl font-serif font-bold text-primary mb-4">Coming Soon</h1>
                <p className="text-gray-600 mb-8">We are crafting this page with care. Check back later.</p>
                <button onClick={() => setRoute('#/')} className="text-primary font-bold underline">Return Home</button>
            </div>
        );
    };

    return (
        <>
            <Header 
                setRoute={setRoute} 
                route={route} 
                onCartClick={() => setIsCartOpen(true)} 
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />
            
            <main className="min-h-screen">
                {renderPage()}
            </main>

            <Footer setRoute={setRoute} />
            
            <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} setRoute={setRoute} />
        </>
    );
};
