import React, { useState, useEffect } from 'react';
import { 
  ChevronLeft, ChevronRight, Plus, Trash2, Check, X, Star, Eye, Sparkles, 
  AlertCircle, Info, MapPin, Globe, Users, Calendar, Clock, Image, Video, Upload,
  Compass, Smartphone, Monitor, ShieldCheck, Heart, ArrowRight, Save, Play, Search
} from 'lucide-react';
import { PhotoUpload } from './PhotoUpload';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { Experience } from '../types';
import { ExperienceDetails } from './ExperienceDetails';
import { motion, AnimatePresence } from 'framer-motion';

interface HostExperienceFormProps {
    onBack: () => void;
    onSuccess: () => void;
    existingExperience?: Experience;
}

const STEPS = [
  { id: 1, name: 'Basics', label: 'Basics & Narrative', desc: 'Title, destinations, core info, photos, and video' },
  { id: 2, name: 'Waypoints', label: 'Geospatial Waypoints', desc: 'Day-by-day map points & elevation' },
  { id: 3, name: 'Stay', label: 'Included Luxury Stay', desc: 'Resort/hotel and core amenities' },
  { id: 4, name: 'Excursions', label: 'Excursion Stops', desc: 'Places to visit on the route' },
  { id: 5, name: 'Logistics', label: 'Logistics & Checklists', desc: 'Includes, excludes, carry list, rules' },
  { id: 6, name: 'SEO', label: 'SEO Social Card', desc: 'Google Search & SEO Card mock' }
];

const AUDIENCE_OPTIONS = [
  { id: 'all', label: 'All Audiences' },
  { id: 'corporate', label: 'Corporate Groups' },
  { id: 'couples', label: 'Couples Only' }
];

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Hindi', 'Malayalam', 'Tamil', 'Kannada', 'Italian', 'Japanese', 'Mandarin'];

export const HostExperienceForm: React.FC<HostExperienceFormProps> = ({ onBack, onSuccess, existingExperience }) => {
    const { user, token } = useAuth();
    const { addToast } = useToast();
    const [saving, setSaving] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [previewFidelity, setPreviewFidelity] = useState<'desktop' | 'mobile'>('desktop');
    const [submitted, setSubmitted] = useState(false);

    // Form inputs state
    const [formData, setFormData] = useState({
        title: existingExperience?.title || '',
        description: existingExperience?.description || '',
        destination: existingExperience?.destination || '',
        departure_location: existingExperience?.departure_location || '',
        start_date: existingExperience?.start_date ? new Date(existingExperience.start_date).toISOString().split('T')[0] : '',
        end_date: existingExperience?.end_date ? new Date(existingExperience.end_date).toISOString().split('T')[0] : '',
        start_time: existingExperience?.start_time || '',
        end_time: existingExperience?.end_time || '',
        price: existingExperience?.price?.toString() || '',
        total_spots: existingExperience?.total_spots?.toString() || '',
        available_spots: (existingExperience?.available_spots ?? existingExperience?.total_spots)?.toString() || '',
        status: existingExperience?.status || 'upcoming',
        target_audience: existingExperience?.target_audience || 'all',
        language: existingExperience?.language || 'English',
        cancellation_policy: existingExperience?.cancellation_policy || '',
        map_link: existingExperience?.map_link || '',
        seo_title: existingExperience?.seo_title || '',
        seo_description: existingExperience?.seo_description || '',
        seo_keywords: existingExperience?.seo_keywords || '',
        seo_image_url: existingExperience?.seo_image_url || ''
    });

    // Gallery images
    const [photos, setPhotos] = useState<any[]>(() => {
        const urls = existingExperience?.image_urls || [];
        return urls.map((url: string, i: number) => ({
            id: `img-${i}-${Math.random().toString(36).substring(2, 9)}`,
            url,
            previewUrl: url
        }));
    });

    // Experience video stream links
    const [videoUrls, setVideoUrls] = useState<string[]>(existingExperience?.video_urls || []);
    const [newVideoUrl, setNewVideoUrl] = useState('');

    // Itinerary Waypoints
    const [itinerary, setItinerary] = useState<any[]>(existingExperience?.itinerary || []);
    const [expandedItineraryIndices, setExpandedItineraryIndices] = useState<Record<number, boolean>>({ 0: true });

    // Included Stay
    const [includedStay, setIncludedStay] = useState<any>(existingExperience?.included_stay || { 
        title: '', 
        location: '', 
        image: '', 
        amenities: [], 
        description: '', 
        long_description: '', 
        gallery: [],
        video: ''
    });

    // Excursions (Places to visit)
    const [placesToVisit, setPlacesToVisit] = useState<any[]>(existingExperience?.places_to_visit || []);
    const [expandedExcursionIndices, setExpandedExcursionIndices] = useState<Record<number, boolean>>({ 0: true });

    // Logistics & checklists
    const [highlights, setHighlights] = useState<string[]>(existingExperience?.highlights || []);
    const [newHighlight, setNewHighlight] = useState('');

    const [includes, setIncludes] = useState<string[]>(existingExperience?.includes || []);
    const [newInclude, setNewInclude] = useState('');

    const [excludes, setExcludes] = useState<string[]>(existingExperience?.excludes || []);
    const [newExclude, setNewExclude] = useState('');

    const [thingsToCarry, setThingsToCarry] = useState<string[]>(existingExperience?.things_to_carry || []);
    const [newThingToCarry, setNewThingToCarry] = useState('');

    const [importantNotes, setImportantNotes] = useState(existingExperience?.important_notes || '');

    // Focus synchronization scroll helper
    const handleFocus = (sectionName: string) => {
        const previewContainer = document.getElementById('preview-container-content');
        if (!previewContainer) return;

        if (sectionName === 'Step1' || sectionName === 'Basics') {
            previewContainer.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        let searchStr = sectionName.toLowerCase();
        if (sectionName === 'Step2' || sectionName === 'Waypoints') searchStr = "where you'll go";
        if (sectionName === 'Step3' || sectionName === 'Stay') searchStr = 'where you will be sleeping';
        if (sectionName === 'Step4' || sectionName === 'Excursions') searchStr = 'places you will visit';
        if (sectionName === 'Step5' || sectionName === 'Logistics') searchStr = 'what is included';
        if (sectionName === 'Step6' || sectionName === 'SEO') {
            previewContainer.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        const headings = Array.from(previewContainer.querySelectorAll('h1, h2, h3, h4, span, p'));
        const target = headings.find(el => el.textContent?.toLowerCase().includes(searchStr));

        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Auto focus scroll on step transition
    useEffect(() => {
        handleFocus(`Step${currentStep}`);
    }, [currentStep]);

    // Fill realistic luxury demo data
    const fillDemoData = () => {
        setFormData({
            title: 'Wayanad Forest Mystic & Heart Lake Trek',
            description: 'Dive deep into the untamed beauty of the Western Ghats with our signature Wayanad Mystic Trek. Traverse centuries-old plantations, scale the majestic peaks to witness the sacred heart-shaped lake, and sleep under a blanket of premium forest stars.',
            destination: 'Wayanad, Kerala',
            departure_location: 'Bangalore Assembly Point, KA',
            start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            start_time: '06:00',
            end_time: '20:00',
            price: '8500',
            total_spots: '16',
            available_spots: '16',
            status: 'upcoming',
            target_audience: 'all',
            language: 'English',
            cancellation_policy: 'Full refund up to 5 days before departure.',
            map_link: 'https://maps.google.com',
            seo_title: 'Wayanad Forest Mystic & Heart Lake Trek | Premium Kerala Adventures',
            seo_description: 'Book the ultimate 3-day guided hiking and wellness retreat to Wayanad. Complete with 5-star spa resort stay, private guides, and exclusive organic meals.',
            seo_keywords: 'Wayanad trek, Kerala luxury travel, heart lake hiking, Chembra Peak',
            seo_image_url: 'https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&q=80&w=1200'
        });

        setPhotos([
            { id: 'demo-1', url: 'https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&q=80&w=1000' },
            { id: 'demo-2', url: 'https://images.unsplash.com/photo-1596423735880-5c6020ce84b4?auto=format&fit=crop&q=80&w=1000' },
            { id: 'demo-3', url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=1000' }
        ]);

        setVideoUrls([
            'https://assets.mixkit.co/videos/preview/mixkit-hiking-path-on-a-sunny-day-34327-large.mp4'
        ]);

        setItinerary([
            {
                day: 1,
                title: 'Scenic Transit & Forest Check-in',
                description: 'We depart early morning from Bangalore in a luxury AC coach. Enjoy a scenic journey through Bandipur tiger reserve and check into our pristine nature resort.',
                name: 'Vythiri Forest Ridge Entry',
                elevation: '700m',
                distance: 'Starting Point',
                landmark: 'Bandipur Highway Checkpost',
                lat: '11.5362',
                lng: '76.0841'
            },
            {
                day: 2,
                title: 'Chembra Peak Summit & Heart Lake',
                description: 'After a organic breakfast, we embark on the ultimate guided hike to the heart-shaped lake. Absorb breathtaking sights of Wayanad hills and mist.',
                name: 'Chembra summit ridge',
                elevation: '2,100m',
                distance: '14 km trek',
                landmark: 'Heart-Shaped Lake Viewpoint',
                lat: '11.6033',
                lng: '76.1361'
            },
            {
                day: 3,
                title: 'Ancient Caves & Spice Markets',
                description: 'Explore the Neolithic carvings at Edakkal Caves followed by an authentic traditional Kerala feast before heading back to Bangalore.',
                name: 'Edakkal Historical Caves',
                elevation: '1,200m',
                distance: '5 km walk',
                landmark: 'Prehistoric Petroglyph Site',
                lat: '11.6254',
                lng: '76.2343'
            }
        ]);

        setPlacesToVisit([
            {
                id: 1,
                title: 'Chembra Peak',
                location: 'WAYANAD',
                image: 'https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&q=80&w=800',
                description: 'Trek to the natural heart-shaped lake nestled below the highest peak.',
                video: 'https://assets.mixkit.co/videos/preview/mixkit-hiking-path-on-a-sunny-day-34327-large.mp4',
                gallery: [
                    'https://images.unsplash.com/photo-1590050752117-238cb0fb12b1?auto=format&fit=crop&q=80&w=800',
                    'https://images.unsplash.com/photo-1582510003544-4d00b7f7415e?auto=format&fit=crop&q=80&w=800'
                ],
                details: 'A challenging but rewarding trek through emerald tea plantations and thick bamboo woodlands leading to a pristine, everlasting water reservoir.'
            },
            {
                id: 2,
                title: 'Edakkal Caves',
                location: 'WAYANAD',
                image: 'https://images.unsplash.com/photo-1596423735880-5c6020ce84b4?auto=format&fit=crop&q=80&w=800',
                description: 'Marvel at ancient petroglyphs tracing back to Neolithic civilizations.',
                video: '',
                gallery: [
                    'https://images.unsplash.com/photo-1596423735880-5c6020ce84b4?auto=format&fit=crop&q=80&w=800'
                ],
                details: 'A unique geological cleft created by massive boulders crashing into place, featuring rock art and scripts dating back to 6,000 BCE.'
            }
        ]);

        setIncludedStay({
            title: 'Vythiri Village Resort',
            location: 'Wayanad, Kerala',
            image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
            video: 'https://assets.mixkit.co/videos/preview/mixkit-swimming-pool-in-a-luxury-hotel-at-sunset-10332-large.mp4',
            amenities: ['Breakfast Included', 'Pool Access', 'Bonfire Setup', 'Nature Walk', 'Spa Services', 'In-house Cafe'],
            description: 'A 5-star eco-luxury spa resort set beautifully amidst lush tropical rainforests.',
            long_description: 'Wake up to morning birdsongs and cascading mist in ultra-luxury twin-sharing rooms. Complete with suspended rope bridges, an organic infinity pool, signature ayurvedic massage therapy rooms, and high-fidelity dining.',
            gallery: [
                'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=800',
                'https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&q=80&w=800',
                'https://images.unsplash.com/photo-1582719478250-c89408d8ce64?auto=format&fit=crop&q=80&w=800'
            ]
        });

        setHighlights([
            'Expert Native Himalayan-Certified Trek Guides',
            '5-Star Luxury Eco-Resort Stays & Rainforest Infinity Pool',
            'Spectacular Panoramic Heart-Shaped Lake Vantage Sights'
        ]);

        setIncludes([
            '2 Nights Premium twin-sharing resort suite',
            'Organic local spice breakfast spread',
            'Private forest permit fees & gear kits',
            'AC Multi-Axle Volvo Coach transportation'
        ]);

        setExcludes([
            'Personal equipment or souvenir purchases',
            'Self-ordered lunches and dinner beverages'
        ]);

        setThingsToCarry([
            'Anti-slip hiking footwear',
            'Reusable personal steel water container',
            'Waterproof hiking shield/jacket',
            'Powerbank chargers & DSLR cameras'
        ]);

        setImportantNotes('The Chembra peak forest department restricts single-use plastics strictly. Please ensure all carry-on items conform to eco-friendly guidelines.');
        addToast('Stunning luxury demo data loaded into wizard.', 'success');
    };

    // Waypoint Actions
    const addItineraryDay = () => {
        const nextDay = itinerary.length + 1;
        setItinerary([...itinerary, { 
            day: nextDay, 
            title: '', 
            description: '', 
            lat: '', 
            lng: '', 
            name: '', 
            elevation: '', 
            landmark: '', 
            distance: '' 
        }]);
        setExpandedItineraryIndices({ [nextDay - 1]: true });
    };

    const updateItineraryDay = (index: number, field: string, value: any) => {
        const newItinerary = [...itinerary];
        newItinerary[index] = { ...newItinerary[index], [field]: value };
        setItinerary(newItinerary);
    };

    const removeItineraryDay = (index: number) => {
        const newItinerary = itinerary.filter((_, idx) => idx !== index).map((day, idx) => ({
            ...day,
            day: idx + 1
        }));
        setItinerary(newItinerary);
    };

    // Excursion Actions
    const addExcursionStop = () => {
        const newIndex = placesToVisit.length;
        setPlacesToVisit([...placesToVisit, {
            id: Date.now() + Math.random(),
            title: '',
            location: '',
            image: '',
            video: '',
            description: '',
            details: '',
            gallery: []
        }]);
        setExpandedExcursionIndices({ [newIndex]: true });
    };

    const updateExcursionStop = (index: number, field: string, value: any) => {
        const newPlaces = [...placesToVisit];
        newPlaces[index] = { ...newPlaces[index], [field]: value };
        setPlacesToVisit(newPlaces);
    };

    const removeExcursionStop = (index: number) => {
        setPlacesToVisit(placesToVisit.filter((_, idx) => idx !== index));
    };

    const handleFileUpload = async (file: File) => {
        const presignRes = await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, contentType: file.type }),
        });
        if (!presignRes.ok) throw new Error('Failed to create upload URL');
        const { uploadUrl, fileUrl } = await presignRes.json();
        const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
        });
        if (!uploadRes.ok) throw new Error('Failed to upload file');
        return fileUrl;
    };

    const validateStep = (stepNum: number) => {
        if (stepNum === 1) {
            if (!formData.title || formData.title.trim().length < 5) {
                addToast("Validation Error", "Please input an elegant and descriptive event title.", "warning");
                return false;
            }
            if (!formData.description || formData.description.trim().length < 15) {
                addToast("Validation Error", "Please compose a comprehensive event description.", "warning");
                return false;
            }
            if (!formData.destination || !formData.departure_location) {
                addToast("Validation Error", "Departure and destination coordinates are required.", "warning");
                return false;
            }
            if (!formData.price || parseFloat(formData.price) <= 0) {
                addToast("Validation Error", "Please declare a valid base registration price.", "warning");
                return false;
            }
        }
        if (stepNum === 2) {
            if (itinerary.length > 0) {
                const invalid = itinerary.some(day => !day.title || !day.description);
                if (invalid) {
                    addToast("Validation Error", "Please provide a title and detailed description for all waypoint days.", "warning");
                    return false;
                }
            }
        }
        return true;
    };

    const handleNextStep = () => {
        if (validateStep(currentStep)) {
            setCurrentStep(prev => Math.min(6, prev + 1));
        }
    };

    const handlePrevStep = () => {
        setCurrentStep(prev => Math.max(1, prev - 1));
    };

    const handleSubmit = async (e: React.FormEvent, forceStatus?: 'upcoming' | 'sold_out' | 'completed') => {
        e.preventDefault();
        
        // Final sanity validate
        for (let i = 1; i <= 2; i++) {
            if (!validateStep(i)) {
                setCurrentStep(i);
                return;
            }
        }

        setSaving(true);
        try {
            const uploadedUrls = [];
            for (const photo of photos) {
                if (photo.file) {
                    const fileUrl = await handleFileUpload(photo.file);
                    uploadedUrls.push(fileUrl);
                } else {
                    uploadedUrls.push(photo.url || photo.previewUrl);
                }
            }

            const payload = {
                ...formData,
                status: forceStatus || formData.status,
                price: formData.price === '' ? 0 : Number(formData.price),
                total_spots: formData.total_spots === '' ? 10 : Number(formData.total_spots),
                available_spots: formData.available_spots === '' ? (formData.total_spots === '' ? 10 : Number(formData.total_spots)) : Number(formData.available_spots),
                image_urls: uploadedUrls,
                video_urls: videoUrls,
                itinerary,
                includes,
                excludes,
                places_to_visit: placesToVisit,
                included_stay: includedStay,
                highlights,
                things_to_carry: thingsToCarry,
                important_notes: importantNotes,
                host_id: user?.id || 1,
                seo_title: formData.seo_title || formData.title,
                seo_description: formData.seo_description || formData.description?.substring(0, 160),
                seo_keywords: formData.seo_keywords,
                seo_image_url: formData.seo_image_url || uploadedUrls[0] || ''
            };

            const url = existingExperience ? `/api/experiences/${existingExperience.id}` : '/api/experiences';
            const method = existingExperience ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error(errorData.details || errorData.error || 'Failed to save experience');
            }
            
            addToast(`Experience ${existingExperience ? 'revised' : 'published'} successfully`, 'success');
            setSubmitted(true);
            setTimeout(() => {
                onSuccess();
                onBack();
            }, 2000);
        } catch (error: any) {
            console.error('Error saving experience:', error);
            addToast(error.message || 'Failed to register experience metadata.', 'error');
        } finally {
            setSaving(false);
        }
    };

    // Build the dynamic live draft object to pipe directly into ExperienceDetails
    const draftExperience: Experience = {
        id: existingExperience?.id || 999999,
        host_id: user?.id || 0,
        title: formData.title || 'Untitled Exotic Retreat',
        description: formData.description || 'Compose your luxurious event description. It will immediately reflect inside this responsive layout mockup...',
        destination: formData.destination || 'Luxury Destination',
        departure_location: formData.departure_location || 'Departure Assembly Hub',
        start_date: formData.start_date || new Date().toISOString().split('T')[0],
        end_date: formData.end_date || new Date().toISOString().split('T')[0],
        start_time: formData.start_time || '08:00',
        end_time: formData.end_time || '18:00',
        price: Number(formData.price) || 0,
        total_spots: Number(formData.total_spots) || 12,
        available_spots: Number(formData.available_spots) || Number(formData.total_spots) || 12,
        status: formData.status as any,
        target_audience: formData.target_audience as any,
        language: formData.language,
        cancellation_policy: formData.cancellation_policy,
        map_link: formData.map_link,
        itinerary,
        includes,
        excludes,
        image_urls: photos.map(p => p.url || p.previewUrl).filter(Boolean),
        video_urls: videoUrls,
        places_to_visit: placesToVisit,
        included_stay: includedStay,
        highlights,
        things_to_carry: thingsToCarry,
        important_notes: importantNotes,
        seo_title: formData.seo_title,
        seo_description: formData.seo_description,
        seo_keywords: formData.seo_keywords,
        seo_image_url: formData.seo_image_url
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center text-zinc-100">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-20 h-20 bg-emerald-500/20 border border-emerald-500 rounded-full flex items-center justify-center mb-6"
                >
                    <ShieldCheck className="w-10 h-10 text-emerald-400" />
                </motion.div>
                <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">
                  {existingExperience ? 'Experience Updated!' : 'Experience Live and Active!'}
                </h1>
                <p className="text-zinc-400 max-w-md mx-auto text-sm leading-relaxed">
                  {existingExperience 
                    ? "Your luxury real estate alterations have been registered and successfully written to the database." 
                    : "Your architectural and event masterpiece is now published. Guests will be redirected to the exploration dashboard shortly."}
                </p>
            </div>
        );
    }

    const progressPercent = Math.round((currentStep / STEPS.length) * 100);

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-neutral-950 flex flex-col font-sans">
            
            {/* STICKY CONTROL HEADER */}
            <header className="sticky top-0 z-50 bg-white dark:bg-neutral-900 border-b border-zinc-200 dark:border-neutral-800 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-zinc-100 dark:hover:bg-neutral-800 rounded-full transition-colors cursor-pointer text-zinc-900 dark:text-zinc-100">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <div>
                      <h1 className="text-base font-bold text-zinc-900 dark:text-white tracking-tight leading-none">
                        {existingExperience ? 'Revise Luxury Experience' : 'Host Custom Master Experience'}
                      </h1>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-500 mt-1">Adventure & Experience Engine</p>
                    </div>
                </div>

                <div className="hidden lg:flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                    <span>Step {currentStep} of {STEPS.length}</span>
                    <span className="text-zinc-300 dark:text-neutral-700">|</span>
                    <span className="text-zinc-900 dark:text-white font-extrabold">{STEPS[currentStep - 1].name}</span>
                </div>

                <div className="flex items-center gap-2.5">
                    <button 
                        type="button" 
                        onClick={fillDemoData}
                        className="px-3.5 py-2 border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-all flex items-center gap-1.5"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Fill Demo Data</span>
                    </button>
                    <button onClick={onBack} type="button" className="hidden sm:inline-block px-4 py-2 font-bold text-xs uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors cursor-pointer">
                      Abort
                    </button>
                    <button 
                      onClick={(e) => handleSubmit(e, 'upcoming')}
                      disabled={saving} 
                      className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer"
                    >
                        {saving ? 'Syncing...' : existingExperience ? 'Save Changes' : 'Publish Live'}
                    </button>
                </div>
            </header>

            {/* STEPPER PROGRESS RIBBON */}
            <div className="w-full bg-white dark:bg-neutral-900 border-b border-zinc-100 dark:border-neutral-800/50 py-3 px-4 md:px-8">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full border border-zinc-200 dark:border-neutral-700 flex items-center justify-center font-mono font-extrabold text-xs text-zinc-800 dark:text-zinc-200 bg-zinc-50 dark:bg-neutral-850">
                      {progressPercent}%
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Setup Progress</div>
                      <div className="text-sm font-extrabold text-zinc-900 dark:text-white mt-1">{STEPS[currentStep - 1].label}</div>
                    </div>
                  </div>

                  <div className="flex items-center flex-1 justify-end max-w-4xl gap-2 md:gap-3 overflow-x-auto no-scrollbar py-1">
                    {STEPS.map(st => {
                      const isActive = st.id === currentStep;
                      const isCompleted = st.id < currentStep;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            let valid = true;
                            for (let i = 1; i < st.id; i++) {
                              if (!validateStep(i)) {
                                valid = false;
                                setCurrentStep(i);
                                break;
                              }
                            }
                            if (valid) setCurrentStep(st.id);
                          }}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-left transition-all shrink-0 cursor-pointer ${
                            isActive 
                              ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-neutral-800 text-zinc-900 dark:text-white font-extrabold shadow-sm' 
                              : isCompleted 
                                ? 'border-emerald-200 dark:border-emerald-950/40 bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400' 
                                : 'border-zinc-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-zinc-400 dark:text-zinc-500'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-extrabold ${
                            isActive 
                              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900' 
                              : isCompleted 
                                ? 'bg-emerald-500 text-white' 
                                : 'bg-zinc-100 dark:bg-neutral-800 text-zinc-400 dark:text-zinc-500'
                          }`}>
                            {isCompleted ? <Check className="w-3 h-3" /> : st.id}
                          </div>
                          <div className="hidden sm:block text-[11px] uppercase tracking-wider font-bold">
                            {st.name}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                </div>
            </div>

            {/* MAIN DUAL COLUMN CONTENT WORKSPACE */}
            <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 md:px-6 py-6 md:py-8 lg:grid lg:grid-cols-12 lg:gap-8 xl:gap-10 overflow-hidden">
                
                {/* Left Column: Form Fields Wizard */}
                <div className="lg:col-span-6 xl:col-span-6 flex flex-col overflow-y-auto pr-0 lg:pr-2 xl:pr-4 h-[calc(100vh-180px)] no-scrollbar">
                    
                    <form onSubmit={(e) => e.preventDefault()} className="space-y-6 pb-24">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 15 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -15 }}
                                transition={{ duration: 0.25, ease: "easeOut" }}
                                className="space-y-6"
                            >
                                
                                {/* STEP 1: BASICS */}
                                {currentStep === 1 && (
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 1.1</span>
                                                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Core Event Information</h2>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Provide the high-level metadata identifying this experiential package.</p>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Experience Title</label>
                                                <input 
                                                    type="text" 
                                                    required
                                                    value={formData.title}
                                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                                    className="w-full p-3.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                                    placeholder="e.g. Wayanad Forest Mystic & Heart Lake Trek"
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Departure / Assembly Hub</label>
                                                    <input 
                                                        type="text" 
                                                        required
                                                        value={formData.departure_location}
                                                        onChange={e => setFormData({ ...formData, departure_location: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                                        placeholder="e.g. Bangalore Assembly Point, KA"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Final Destination Country / Region</label>
                                                    <input 
                                                        type="text" 
                                                        required
                                                        value={formData.destination}
                                                        onChange={e => setFormData({ ...formData, destination: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                                        placeholder="e.g. Wayanad, Kerala"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Spots Capacity</label>
                                                    <input 
                                                        type="number" 
                                                        required
                                                        value={formData.total_spots}
                                                        onChange={e => setFormData({ ...formData, total_spots: e.target.value, available_spots: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                                                        placeholder="16"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Base Cost (₹)</label>
                                                    <input 
                                                        type="number" 
                                                        required
                                                        value={formData.price}
                                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                                                        placeholder="8500"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Audience Segment</label>
                                                    <select 
                                                        value={formData.target_audience}
                                                        onChange={e => setFormData({ ...formData, target_audience: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                                    >
                                                        {AUDIENCE_OPTIONS.map(opt => (
                                                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Language</label>
                                                    <select 
                                                        value={formData.language}
                                                        onChange={e => setFormData({ ...formData, language: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                                    >
                                                        {LANGUAGES.map(lang => (
                                                            <option key={lang} value={lang}>{lang}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Departure Date</label>
                                                    <input 
                                                        type="date" 
                                                        value={formData.start_date}
                                                        onChange={e => setFormData({ ...formData, start_date: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Return Date</label>
                                                    <input 
                                                        type="date" 
                                                        value={formData.end_date}
                                                        onChange={e => setFormData({ ...formData, end_date: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Start Time</label>
                                                    <input 
                                                        type="time" 
                                                        value={formData.start_time}
                                                        onChange={e => setFormData({ ...formData, start_time: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">End Time</label>
                                                    <input 
                                                        type="time" 
                                                        value={formData.end_time}
                                                        onChange={e => setFormData({ ...formData, end_time: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Narrative Story / Description</label>
                                                <textarea 
                                                    rows={5}
                                                    required
                                                    value={formData.description}
                                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                                    className="w-full p-4 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 resize-none leading-relaxed"
                                                    placeholder="Describe the magical experiences, mountains climbs, campfire stories, and memories you are offering..."
                                                />
                                            </div>
                                        </div>

                                        {/* Gallery upload */}
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 1.2</span>
                                                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Stunning Event Gallery</h2>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Upload high-resolution landscape images. Drag and drop to re-order. The first photo will act as primary hero banner.</p>
                                            </div>

                                            <PhotoUpload photos={photos} setPhotos={setPhotos} maxPhotos={10} />
                                        </div>

                                         {/* Video stream URL */}
                                         <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                                             <div>
                                                 <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 1.3</span>
                                                 <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Dynamic Video Tour Reels</h2>
                                                 <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Paste streaming links (Vimeo, YouTube, or raw `.mp4` URLs) or upload a video file to include engaging video overlays.</p>
                                             </div>
 
                                             <div className="space-y-4">
                                                 {/* File upload zone for local video files */}
                                                 <div className="border-2 border-dashed border-zinc-200 dark:border-neutral-800 rounded-2xl p-6 flex flex-col items-center justify-center bg-zinc-50/50 dark:bg-neutral-900/50 hover:bg-zinc-100 dark:hover:bg-neutral-850 transition-all cursor-pointer relative group">
                                                     <input 
                                                         type="file" 
                                                         accept="video/*" 
                                                         onChange={async (e) => {
                                                             const file = e.target.files?.[0];
                                                             if (!file) return;
                                                             if (file.size > 20 * 1024 * 1024) {
                                                                 addToast('Please upload a video file smaller than 20MB', 'error');
                                                                 return;
                                                             }
                                                             addToast('Reading video file...', 'info');
                                                             const reader = new FileReader();
                                                             reader.onload = (event) => {
                                                                 const base64Data = event.target?.result as string;
                                                                 if (base64Data) {
                                                                     setVideoUrls([...videoUrls, base64Data]);
                                                                     addToast('Video file uploaded successfully!', 'success');
                                                                 }
                                                             };
                                                             reader.onerror = () => {
                                                                 addToast('Failed to read video file', 'error');
                                                             };
                                                             reader.readAsDataURL(file);
                                                         }}
                                                         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                     />
                                                     <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                                                         <div className="p-3 bg-white dark:bg-neutral-800 rounded-full shadow-sm text-zinc-400 group-hover:text-emerald-500 transition-colors">
                                                             <Upload className="w-5 h-5" />
                                                         </div>
                                                         <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Upload a Video Tour File</span>
                                                         <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Drag & drop or click to choose (Max 20MB)</span>
                                                     </div>
                                                 </div>

                                                 <div className="relative flex items-center justify-center py-2">
                                                     <div className="absolute inset-0 flex items-center">
                                                         <div className="w-full border-t border-zinc-100 dark:border-neutral-800" />
                                                     </div>
                                                     <span className="relative px-3 bg-white dark:bg-neutral-900 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Or paste a link</span>
                                                 </div>

                                                 <div className="flex gap-2">
                                                     <input 
                                                         type="text" 
                                                         value={newVideoUrl}
                                                         onChange={e => setNewVideoUrl(e.target.value)}
                                                         className="flex-1 p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none"
                                                         placeholder="https://www.youtube.com/watch?v=..."
                                                     />
                                                     <button 
                                                         type="button"
                                                         onClick={() => {
                                                             if (newVideoUrl.trim()) {
                                                                 setVideoUrls([...videoUrls, newVideoUrl.trim()]);
                                                                 setNewVideoUrl('');
                                                                 addToast('Video link appended successfully', 'success');
                                                             }
                                                         }}
                                                         className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 rounded-xl font-bold text-xs uppercase"
                                                     >
                                                         Add
                                                     </button>
                                                 </div>

                                                {videoUrls.length > 0 && (
                                                    <div className="space-y-2 pt-2">
                                                        {videoUrls.map((vid, idx) => (
                                                            <div key={idx} className="flex items-center justify-between p-2.5 bg-zinc-50 dark:bg-neutral-850 rounded-xl border border-zinc-100 dark:border-neutral-800">
                                                                <div className="flex items-center gap-2 overflow-hidden mr-2">
                                                                    <Video className="w-4 h-4 text-emerald-500 shrink-0" />
                                                                    <span className="text-[11px] font-mono text-zinc-600 dark:text-zinc-400 truncate">{vid}</span>
                                                                </div>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setVideoUrls(videoUrls.filter((_, i) => i !== idx))}
                                                                    className="p-1 hover:text-red-500 text-zinc-400 transition-colors cursor-pointer"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>
                                )}

                                {/* STEP 2: GEOSPATIAL WAYPOINTS */}
                                {currentStep === 2 && (
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 2.1</span>
                                                    <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Waypoints & Spatial Trails</h2>
                                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Configure physical locations, elevation metrics, and custom coordinates for each day.</p>
                                                </div>
                                                <button 
                                                    type="button"
                                                    onClick={addItineraryDay}
                                                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase rounded-lg transition-all"
                                                >
                                                    + Add Day
                                                </button>
                                            </div>

                                            {itinerary.length === 0 && (
                                                <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-neutral-800 rounded-2xl text-zinc-400 text-xs italic">
                                                    No waypoints built. Please click "+ Add Day" to define hiking steps.
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                {itinerary.map((day, idx) => {
                                                    const isExpanded = !!expandedItineraryIndices[idx];
                                                    return (
                                                        <div key={idx} className={`border rounded-2xl transition-all shadow-sm ${isExpanded ? 'border-zinc-900 dark:border-white p-5 bg-white dark:bg-neutral-900' : 'border-zinc-200/60 dark:border-neutral-800/80 p-3 bg-zinc-50/50 dark:bg-neutral-900/30'}`}>
                                                            
                                                            <div 
                                                                className="flex items-center justify-between cursor-pointer"
                                                                onClick={() => setExpandedItineraryIndices({ ...expandedItineraryIndices, [idx]: !isExpanded })}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-500 text-xs">
                                                                        {idx + 1}
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white">{day.title || `Day ${idx + 1} Waypoint`}</h4>
                                                                        {day.name && <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">{day.name} • {day.distance || '0km'}</span>}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={(e) => { e.stopPropagation(); removeItineraryDay(idx); }}
                                                                        className="p-1 hover:text-red-500 text-zinc-400 transition-colors"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                                                                        {isExpanded ? 'COLLAPSE' : 'EDIT'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <AnimatePresence initial={false}>
                                                                {isExpanded && (
                                                                    <motion.div 
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: 'auto', opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        transition={{ duration: 0.2 }}
                                                                        className="mt-4 pt-4 border-t border-zinc-100 dark:border-neutral-800 space-y-4 overflow-hidden"
                                                                    >
                                                                        <div className="space-y-2">
                                                                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Waypoint Heading/Title</label>
                                                                            <input 
                                                                                type="text"
                                                                                required
                                                                                value={day.title || ''}
                                                                                onChange={e => updateItineraryDay(idx, 'title', e.target.value)}
                                                                                className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                                                                                placeholder="e.g. scenic transit & mountain ascent"
                                                                            />
                                                                        </div>

                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                            <div className="space-y-2">
                                                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Precise Location Name</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={day.name || ''}
                                                                                    onChange={e => updateItineraryDay(idx, 'name', e.target.value)}
                                                                                    className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                                                                                    placeholder="e.g. Vythiri Forest Entry Checkpoint"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Transit Distance / Hike Time</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={day.distance || ''}
                                                                                    onChange={e => updateItineraryDay(idx, 'distance', e.target.value)}
                                                                                    className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                                                                                    placeholder="e.g. 14 km trek or 45 min boat"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                                                            <div className="space-y-1.5">
                                                                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Latitude</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={day.lat || ''}
                                                                                    onChange={e => updateItineraryDay(idx, 'lat', e.target.value)}
                                                                                    className="w-full p-2 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-[11px] text-zinc-900 dark:text-white font-mono"
                                                                                    placeholder="e.g. 11.5362"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-1.5">
                                                                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Longitude</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={day.lng || ''}
                                                                                    onChange={e => updateItineraryDay(idx, 'lng', e.target.value)}
                                                                                    className="w-full p-2 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-[11px] text-zinc-900 dark:text-white font-mono"
                                                                                    placeholder="e.g. 76.0841"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-1.5">
                                                                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Elevation</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={day.elevation || ''}
                                                                                    onChange={e => updateItineraryDay(idx, 'elevation', e.target.value)}
                                                                                    className="w-full p-2 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-[11px] text-zinc-900 dark:text-white"
                                                                                    placeholder="e.g. 2100m"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-1.5">
                                                                                <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Landmark</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={day.landmark || ''}
                                                                                    onChange={e => updateItineraryDay(idx, 'landmark', e.target.value)}
                                                                                    className="w-full p-2 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-[11px] text-zinc-900 dark:text-white"
                                                                                    placeholder="Vythiri Ridge"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="space-y-2">
                                                                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Day Narrative Description</label>
                                                                            <textarea 
                                                                                rows={3}
                                                                                required
                                                                                value={day.description || ''}
                                                                                onChange={e => updateItineraryDay(idx, 'description', e.target.value)}
                                                                                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
                                                                                placeholder="Describe step activities, rest spots, and scheduled meals details..."
                                                                            />
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 3: LUXURY STAY */}
                                {currentStep === 3 && (
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 3.1</span>
                                                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Luxury Stay Resort</h2>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Specify hotel/resort accommodations integrated directly within the package.</p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Resort / Hotel Name</label>
                                                    <input 
                                                        type="text"
                                                        value={includedStay.title || ''}
                                                        onChange={e => setIncludedStay({ ...includedStay, title: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                                        placeholder="Vythiri Village Resort"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Resort Location</label>
                                                    <input 
                                                        type="text"
                                                        value={includedStay.location || ''}
                                                        onChange={e => setIncludedStay({ ...includedStay, location: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                                        placeholder="Wayanad, Kerala"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cover Image URL</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={includedStay.image || ''}
                                                        onChange={e => setIncludedStay({ ...includedStay, image: e.target.value })}
                                                        className="flex-1 p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                        placeholder="https://..."
                                                    />
                                                    <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-4 py-3 rounded-xl text-xs font-bold uppercase whitespace-nowrap flex items-center justify-center">
                                                        Upload
                                                        <input 
                                                            type="file" 
                                                            accept="image/*" 
                                                            className="hidden" 
                                                            onChange={async (e) => {
                                                                if (e.target.files?.[0]) {
                                                                    try {
                                                                        const url = await handleFileUpload(e.target.files[0]);
                                                                        setIncludedStay({ ...includedStay, image: url });
                                                                        addToast('Resort banner uploaded', 'success');
                                                                    } catch (err) { addToast('Upload failed', 'error'); }
                                                                }
                                                            }} 
                                                        />
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Resort Tour Video (Optional)</label>
                                                <input 
                                                    type="text"
                                                    value={includedStay.video || ''}
                                                    onChange={e => setIncludedStay({ ...includedStay, video: e.target.value })}
                                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                    placeholder="https://assets.mixkit.co/videos/preview/..."
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Short Summary Description</label>
                                                <textarea 
                                                    rows={2}
                                                    value={includedStay.description || ''}
                                                    onChange={e => setIncludedStay({ ...includedStay, description: e.target.value })}
                                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
                                                    placeholder="Brief overview highlight..."
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Long detailed description</label>
                                                <textarea 
                                                    rows={4}
                                                    value={includedStay.long_description || ''}
                                                    onChange={e => setIncludedStay({ ...includedStay, long_description: e.target.value })}
                                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
                                                    placeholder="Complete layout descriptions, sleep accommodations (e.g. private cabins, infinity pool details)..."
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Resort Amenities (Comma separated)</label>
                                                <input 
                                                    type="text"
                                                    value={includedStay.amenities?.join(', ') || ''}
                                                    onChange={e => setIncludedStay({ ...includedStay, amenities: e.target.value.split(',').map(a => a.trim()).filter(Boolean) })}
                                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                    placeholder="e.g. WiFi, Infinity Pool, Bonfire, Spa"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Resort Gallery (Comma separated URLs)</label>
                                                <input 
                                                    type="text"
                                                    value={includedStay.gallery?.join(', ') || ''}
                                                    onChange={e => setIncludedStay({ ...includedStay, gallery: e.target.value.split(',').map(a => a.trim()).filter(Boolean) })}
                                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                    placeholder="https://image1.com, https://image2.com"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 4: EXCURSION STOPS */}
                                {currentStep === 4 && (
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 4.1</span>
                                                    <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Excursion stops & points</h2>
                                                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Configure individual sights, activities, or landmarks visited on this tour.</p>
                                                </div>
                                                <button 
                                                    type="button"
                                                    onClick={addExcursionStop}
                                                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase rounded-lg transition-all"
                                                >
                                                    + Add Stop
                                                </button>
                                            </div>

                                            {placesToVisit.length === 0 && (
                                                <div className="p-8 text-center border-2 border-dashed border-zinc-200 dark:border-neutral-800 rounded-2xl text-zinc-400 text-xs italic">
                                                    No excursion stops configured.
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                {placesToVisit.map((place, idx) => {
                                                    const isExpanded = !!expandedExcursionIndices[idx];
                                                    return (
                                                        <div key={idx} className={`border rounded-2xl transition-all shadow-sm ${isExpanded ? 'border-zinc-900 dark:border-white p-5 bg-white dark:bg-neutral-900' : 'border-zinc-200/60 dark:border-neutral-800/80 p-3 bg-zinc-50/50 dark:bg-neutral-900/30'}`}>
                                                            
                                                            <div 
                                                                className="flex items-center justify-between cursor-pointer"
                                                                onClick={() => setExpandedExcursionIndices({ ...expandedExcursionIndices, [idx]: !isExpanded })}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center font-bold text-emerald-500 text-xs">
                                                                        {idx + 1}
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="font-extrabold text-sm text-zinc-900 dark:text-white">{place.title || `Excursion Destination ${idx + 1}`}</h4>
                                                                        {place.location && <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest">{place.location}</span>}
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <button 
                                                                        type="button" 
                                                                        onClick={(e) => { e.stopPropagation(); removeExcursionStop(idx); }}
                                                                        className="p-1 hover:text-red-500 text-zinc-400 transition-colors"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">
                                                                        {isExpanded ? 'COLLAPSE' : 'EDIT'}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <AnimatePresence initial={false}>
                                                                {isExpanded && (
                                                                    <motion.div 
                                                                        initial={{ height: 0, opacity: 0 }}
                                                                        animate={{ height: 'auto', opacity: 1 }}
                                                                        exit={{ height: 0, opacity: 0 }}
                                                                        transition={{ duration: 0.2 }}
                                                                        className="mt-4 pt-4 border-t border-zinc-100 dark:border-neutral-800 space-y-4 overflow-hidden"
                                                                    >
                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                            <div className="space-y-2">
                                                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sights/Stop Title</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    required
                                                                                    value={place.title || ''}
                                                                                    onChange={e => updateExcursionStop(idx, 'title', e.target.value)}
                                                                                    className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                                                                                    placeholder="e.g. Chembra Peak"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Sights Location Name</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={place.location || ''}
                                                                                    onChange={e => updateExcursionStop(idx, 'location', e.target.value)}
                                                                                    className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                                                                                    placeholder="e.g. WAYANAD"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="space-y-2">
                                                                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Stop Image URL / Upload</label>
                                                                            <div className="flex gap-2">
                                                                                <input 
                                                                                    type="text"
                                                                                    value={place.image || ''}
                                                                                    onChange={e => updateExcursionStop(idx, 'image', e.target.value)}
                                                                                    className="flex-1 p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                                                    placeholder="https://..."
                                                                                />
                                                                                <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase whitespace-nowrap flex items-center justify-center">
                                                                                    Upload
                                                                                    <input 
                                                                                        type="file" 
                                                                                        accept="image/*" 
                                                                                        className="hidden" 
                                                                                        onChange={async (e) => {
                                                                                            if (e.target.files?.[0]) {
                                                                                                try {
                                                                                                    const url = await handleFileUpload(e.target.files[0]);
                                                                                                    updateExcursionStop(idx, 'image', url);
                                                                                                    addToast('Stop banner uploaded', 'success');
                                                                                                } catch (err) { addToast('Upload failed', 'error'); }
                                                                                            }
                                                                                        }} 
                                                                                    />
                                                                                </label>
                                                                            </div>
                                                                        </div>

                                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                            <div className="space-y-2">
                                                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Stop Video URL (Optional)</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={place.video || ''}
                                                                                    onChange={e => updateExcursionStop(idx, 'video', e.target.value)}
                                                                                    className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                                                    placeholder="https://..."
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-2">
                                                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Gallery Image URLs (Comma separated)</label>
                                                                                <input 
                                                                                    type="text"
                                                                                    value={place.gallery?.join(', ') || ''}
                                                                                    onChange={e => updateExcursionStop(idx, 'gallery', e.target.value.split(',').map(a => a.trim()).filter(Boolean))}
                                                                                    className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                                                    placeholder="https://img1.com, https://img2.com"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="space-y-2">
                                                                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Short Description Summary</label>
                                                                            <input 
                                                                                type="text"
                                                                                value={place.description || ''}
                                                                                onChange={e => updateExcursionStop(idx, 'description', e.target.value)}
                                                                                className="w-full p-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                                                                                placeholder="e.g. Climb to heart-shaped lake."
                                                                            />
                                                                        </div>

                                                                        <div className="space-y-2">
                                                                            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Detailed Stop Profile</label>
                                                                            <textarea 
                                                                                rows={3}
                                                                                value={place.details || ''}
                                                                                onChange={e => updateExcursionStop(idx, 'details', e.target.value)}
                                                                                className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 resize-none leading-relaxed"
                                                                                placeholder="Provide background info, historical significance, or specific challenges..."
                                                                            />
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 5: LOGISTICS & CHECKLISTS */}
                                {currentStep === 5 && (
                                    <div className="space-y-6">
                                        
                                        {/* Highlights list builder */}
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 5.1</span>
                                                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Experience Highlights</h2>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Specify key unique value propositions shown at the top of the details page.</p>
                                            </div>

                                            <div className="flex gap-2">
                                                <input 
                                                    type="text"
                                                    value={newHighlight}
                                                    onChange={e => setNewHighlight(e.target.value)}
                                                    className="flex-1 p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none"
                                                    placeholder="e.g. Certified Native Guides & Experts"
                                                />
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        if (newHighlight.trim()) {
                                                            setHighlights([...highlights, newHighlight.trim()]);
                                                            setNewHighlight('');
                                                        }
                                                    }}
                                                    className="px-4 py-3 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 rounded-xl font-bold text-xs uppercase"
                                                >
                                                    + Add
                                                </button>
                                            </div>

                                            {highlights.length > 0 && (
                                                <div className="flex flex-wrap gap-2 pt-2">
                                                    {highlights.map((hl, i) => (
                                                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                                            <span>{hl}</span>
                                                            <button type="button" onClick={() => setHighlights(highlights.filter((_, idx) => idx !== i))} className="hover:text-red-500 text-zinc-400">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Inclusions & Exclusions */}
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 5.2</span>
                                                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Pricing Inclusions & Exclusions</h2>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Be absolutely clear with guests about what is covered in their registration fee.</p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                {/* Inclusions */}
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Inclusions List</label>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="text"
                                                            value={newInclude}
                                                            onChange={e => setNewInclude(e.target.value)}
                                                            className="flex-1 p-2 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                            placeholder="e.g. 5-Star Resort stay"
                                                        />
                                                        <button 
                                                            type="button"
                                                            onClick={() => {
                                                                if (newInclude.trim()) {
                                                                    setIncludes([...includes, newInclude.trim()]);
                                                                    setNewInclude('');
                                                                }
                                                            }}
                                                            className="px-2.5 bg-emerald-500 text-white rounded-lg font-bold text-xs uppercase"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <div className="space-y-1 pt-1">
                                                        {includes.map((inc, i) => (
                                                            <div key={i} className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-neutral-850 rounded-lg text-xs">
                                                                <span className="text-zinc-600 dark:text-zinc-300 truncate">{inc}</span>
                                                                <button type="button" onClick={() => setIncludes(includes.filter((_, idx) => idx !== i))} className="hover:text-red-500 text-zinc-400 shrink-0 ml-2">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Exclusions */}
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Exclusions List</label>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="text"
                                                            value={newExclude}
                                                            onChange={e => setNewExclude(e.target.value)}
                                                            className="flex-1 p-2 rounded-lg border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                            placeholder="e.g. flights to Bangalore"
                                                        />
                                                        <button 
                                                            type="button"
                                                            onClick={() => {
                                                                if (newExclude.trim()) {
                                                                    setExcludes([...excludes, newExclude.trim()]);
                                                                    setNewExclude('');
                                                                }
                                                            }}
                                                            className="px-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-950 rounded-lg font-bold text-xs uppercase"
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <div className="space-y-1 pt-1">
                                                        {excludes.map((exc, i) => (
                                                            <div key={i} className="flex items-center justify-between p-2 bg-zinc-50 dark:bg-neutral-850 rounded-lg text-xs">
                                                                <span className="text-zinc-600 dark:text-zinc-300 truncate">{exc}</span>
                                                                <button type="button" onClick={() => setExcludes(excludes.filter((_, idx) => idx !== i))} className="hover:text-red-500 text-zinc-400 shrink-0 ml-2">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Things to carry, Cancellation policy, notes */}
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 5.3</span>
                                                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Rules & Carry List</h2>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Specify preparation guidelines, carry gear, and cancellation windows.</p>
                                            </div>

                                            <div className="space-y-3">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Things to Carry</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={newThingToCarry}
                                                        onChange={e => setNewThingToCarry(e.target.value)}
                                                        className="flex-1 p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none"
                                                        placeholder="e.g. Anti-slip hiking boots"
                                                    />
                                                    <button 
                                                        type="button"
                                                        onClick={() => {
                                                            if (newThingToCarry.trim()) {
                                                                setThingsToCarry([...thingsToCarry, newThingToCarry.trim()]);
                                                                setNewThingToCarry('');
                                                            }
                                                        }}
                                                        className="px-4 py-3 bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                                {thingsToCarry.length > 0 && (
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        {thingsToCarry.map((thing, i) => (
                                                            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-zinc-100 dark:bg-neutral-800 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                                                <span>{thing}</span>
                                                                <button type="button" onClick={() => setThingsToCarry(thingsToCarry.filter((_, idx) => idx !== i))} className="hover:text-red-500 text-zinc-400">
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Cancellation Policy Rules</label>
                                                <input 
                                                    type="text"
                                                    value={formData.cancellation_policy}
                                                    onChange={e => setFormData({ ...formData, cancellation_policy: e.target.value })}
                                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs font-semibold text-zinc-900 dark:text-white outline-none"
                                                    placeholder="e.g. Full refund up to 7 days before departure."
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Important Notes & Rules</label>
                                                <textarea 
                                                    rows={3}
                                                    value={importantNotes}
                                                    onChange={e => setImportantNotes(e.target.value)}
                                                    className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none resize-none leading-relaxed"
                                                    placeholder="e.g. Plastics are strictly restricted at this resort campus..."
                                                />
                                            </div>
                                        </div>

                                    </div>
                                )}

                                {/* STEP 6: SEO PREVIEW ENGINE */}
                                {currentStep === 6 && (
                                    <div className="space-y-6">
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-6">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-500">Segment 6.1</span>
                                                <h2 className="text-lg font-extrabold text-zinc-900 dark:text-white tracking-tight mt-0.5">Google Search Results Card</h2>
                                                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Configure search titles and description tags to maximize discoverability.</p>
                                            </div>

                                            <div className="space-y-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">SEO Title Meta Tag</label>
                                                    <input 
                                                        type="text" 
                                                        value={formData.seo_title}
                                                        onChange={e => setFormData({ ...formData, seo_title: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                        placeholder="Custom SEO Title"
                                                    />
                                                </div>

                                                <div className="space-y-1.5">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">SEO Description Meta Tag</label>
                                                    <textarea 
                                                        rows={2}
                                                        value={formData.seo_description}
                                                        onChange={e => setFormData({ ...formData, seo_description: e.target.value })}
                                                        className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none resize-none"
                                                        placeholder="Custom SEO description..."
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">SEO Keywords</label>
                                                        <input 
                                                            type="text" 
                                                            value={formData.seo_keywords}
                                                            onChange={e => setFormData({ ...formData, seo_keywords: e.target.value })}
                                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                            placeholder="trekking, kerala, retreat"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">SEO Social Image URL</label>
                                                        <input 
                                                            type="text" 
                                                            value={formData.seo_image_url}
                                                            onChange={e => setFormData({ ...formData, seo_image_url: e.target.value })}
                                                            className="w-full p-3 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs text-zinc-900 dark:text-white outline-none"
                                                            placeholder="https://..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dynamic real-time Google search result mock */}
                                        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-6 border border-zinc-200/60 dark:border-neutral-800 shadow-sm space-y-4">
                                            <div>
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Real-Time Search engine Mockup</label>
                                            </div>
                                            <div className="p-5 bg-white dark:bg-neutral-950 border border-zinc-250 dark:border-neutral-900 rounded-xl font-sans max-w-lg">
                                                <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                                                    <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                                    <span>https://encho.space › experiences › details</span>
                                                </div>
                                                <h3 className="text-lg font-medium text-blue-800 dark:text-blue-400 hover:underline cursor-pointer mt-1 leading-snug">
                                                    {formData.seo_title || formData.title || 'Untitled Exotic Retreat | Encho Space'}
                                                </h3>
                                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed truncate-3-lines">
                                                    <span className="text-zinc-400 dark:text-zinc-500 font-medium">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} — </span>
                                                    {formData.seo_description || formData.description || 'Provide a compelling description story so search engine spiders can rank this experiential listing higher dynamically...'}
                                                </p>
                                            </div>
                                        </div>

                                    </div>
                                )}

                            </motion.div>
                        </AnimatePresence>

                        {/* STEP NAVIGATION CONTROLS */}
                        <div className="flex items-center justify-between pt-6 border-t border-zinc-200 dark:border-neutral-800">
                            <button
                                type="button"
                                onClick={handlePrevStep}
                                disabled={currentStep === 1}
                                className="px-5 py-2.5 rounded-xl border border-zinc-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:bg-zinc-50 dark:hover:bg-neutral-800/60 text-zinc-700 dark:text-zinc-300 font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-40 cursor-pointer"
                            >
                                Previous Step
                            </button>

                            {currentStep < 6 ? (
                                <button
                                    type="button"
                                    onClick={handleNextStep}
                                    className="px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                                >
                                    <span>Next Step</span>
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={(e) => handleSubmit(e, 'upcoming')}
                                    disabled={saving}
                                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                                >
                                    {saving ? 'Syncing...' : 'Publish Master'}
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* Right Column: High-Fidelity Desktop or Mobile Preview frame simulation */}
                <div className="hidden lg:col-span-6 xl:col-span-6 lg:flex flex-col h-[calc(100vh-180px)] border border-zinc-200/80 dark:border-neutral-800 bg-zinc-50 dark:bg-neutral-900 rounded-2xl overflow-hidden relative shadow-inner">
                    
                    {/* Frame Top control bar */}
                    <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900 flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <span className="w-3 h-3 rounded-full bg-red-400" />
                             <span className="w-3 h-3 rounded-full bg-amber-400" />
                             <span className="w-3 h-3 rounded-full bg-green-400" />
                             <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 ml-2">Live Responsive Simulation</span>
                         </div>

                         {/* Device Width toggles */}
                         <div className="flex items-center gap-1 bg-zinc-100 dark:bg-neutral-800 p-1 rounded-xl">
                           <button
                             type="button"
                             onClick={() => setPreviewFidelity('desktop')}
                             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                               previewFidelity === 'desktop' 
                                 ? 'bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white shadow-sm' 
                                 : 'text-zinc-400 hover:text-zinc-600'
                             }`}
                           >
                             <Monitor className="w-3.5 h-3.5" />
                             Desktop View
                           </button>
                           <button
                             type="button"
                             onClick={() => setPreviewFidelity('mobile')}
                             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                               previewFidelity === 'mobile' 
                                 ? 'bg-white dark:bg-neutral-900 text-zinc-900 dark:text-white shadow-sm' 
                                 : 'text-zinc-400 hover:text-zinc-600'
                             }`}
                           >
                             <Smartphone className="w-3.5 h-3.5" />
                             Mobile View
                           </button>
                         </div>
                    </div>

                    {/* Simulated Screen Container */}
                    <div className="flex-1 bg-zinc-100 dark:bg-neutral-950 p-4 md:p-6 border-b border-x border-zinc-200/80 dark:border-neutral-800 rounded-b-2xl flex items-center justify-center overflow-hidden relative">
                      
                      {previewFidelity === 'desktop' ? (
                        <div 
                          id="preview-container-content"
                          className="w-full h-full bg-[#0a0a0a] rounded-2xl overflow-y-auto border border-zinc-200/60 dark:border-neutral-850 shadow-md no-scrollbar relative pointer-events-none"
                        >
                          <div className="scale-[0.9] origin-top">
                            <ExperienceDetails 
                              experience={draftExperience} 
                              onBack={() => {}} 
                            />
                          </div>
                        </div>
                      ) : (
                        // Premium smartphone device mockup frame
                        <div className="relative w-[340px] h-[98%] max-h-[640px] bg-neutral-950 rounded-[48px] p-3 border-[10px] border-neutral-900 shadow-2xl overflow-hidden ring-4 ring-neutral-850 flex flex-col shrink-0">
                          
                          {/* Dynamic Notch */}
                          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-50 flex items-center justify-between px-3">
                            <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                              <div className="w-1 h-1 rounded-full bg-blue-900/40" />
                            </div>
                            <div className="w-1.5 h-1.5 rounded-full bg-[#0284C7]/20 animate-pulse" />
                          </div>

                          {/* Simulated View */}
                          <div 
                            id="preview-container-content"
                            className="flex-1 bg-[#0a0a0a] rounded-[38px] overflow-y-auto no-scrollbar pointer-events-none relative"
                          >
                            <div className="scale-[0.75] origin-top-left w-[133%] h-auto pb-10">
                              <ExperienceDetails 
                                experience={draftExperience} 
                                onBack={() => {}} 
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                </div>

            </main>

        </div>
    );
};

export default HostExperienceForm;
