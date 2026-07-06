import React, { useState } from 'react';
import { ChevronLeft, Plus, Trash2, Check, X, Star, Eye } from 'lucide-react';
import { PhotoUpload } from './PhotoUpload';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { Experience } from '../types';
import { ExperienceDetails } from './ExperienceDetails';

interface HostExperienceFormProps {
    onBack: () => void;
    onSuccess: () => void;
    existingExperience?: Experience;
}

export const HostExperienceForm: React.FC<HostExperienceFormProps> = ({ onBack, onSuccess, existingExperience }) => {
    const { user, token } = useAuth();
    const { addToast } = useToast();
    const [saving, setSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const [formData, setFormData] = useState({
        title: existingExperience?.title || '',
        description: existingExperience?.description || '',
        destination: existingExperience?.destination || '',
        departure_location: existingExperience?.departure_location || '',
        start_date: existingExperience?.start_date ? new Date(existingExperience.start_date).toISOString().split('T')[0] : '',
        end_date: existingExperience?.end_date ? new Date(existingExperience.end_date).toISOString().split('T')[0] : '',
        start_time: existingExperience?.start_time || '',
        end_time: existingExperience?.end_time || '',
        price: existingExperience?.price || '',
        total_spots: existingExperience?.total_spots || '',
        available_spots: existingExperience?.available_spots ?? (existingExperience?.total_spots || ''),
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

    const [photos, setPhotos] = useState<any[]>(
        existingExperience?.image_urls?.map((url: string, i: number) => ({ id: `img-${i}`, url })) || []
    );
    const [videoUrls, setVideoUrls] = useState<string[]>(existingExperience?.video_urls || []);
    const [newVideoUrl, setNewVideoUrl] = useState('');

    const [itinerary, setItinerary] = useState<any[]>(existingExperience?.itinerary || []);
    const [includes, setIncludes] = useState<string[]>(existingExperience?.includes || []);
    const [newInclude, setNewInclude] = useState('');
    
    const [excludes, setExcludes] = useState<string[]>(existingExperience?.excludes || []);
    const [newExclude, setNewExclude] = useState('');
    
    const [placesToVisit, setPlacesToVisit] = useState<any[]>(existingExperience?.places_to_visit || []);
    const [includedStay, setIncludedStay] = useState<any>(existingExperience?.included_stay || { title: '', location: '', image: '', amenities: [], description: '' });

    const [highlights, setHighlights] = useState<string[]>(existingExperience?.highlights || []);
    const [newHighlight, setNewHighlight] = useState('');
    
    const [thingsToCarry, setThingsToCarry] = useState<string[]>(existingExperience?.things_to_carry || []);
    const [newThingToCarry, setNewThingToCarry] = useState('');
    
    const [importantNotes, setImportantNotes] = useState(existingExperience?.important_notes || '');

    const fillDemoData = () => {
        setFormData({
            title: 'AI & Future Tech Summit Retreat',
            description: 'Join top AI researchers and enthusiasts for a weekend of intensive workshops, networking, and futuristic discussions in a serene environment. We will cover the latest in generative AI, agentic systems, and ethical AI.',
            destination: 'Silicon Valley Mountains',
            departure_location: 'San Francisco, CA',
            start_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end_date: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            start_time: '10:00',
            end_time: '18:00',
            price: '999',
            total_spots: '50',
            available_spots: '50',
            status: 'upcoming',
            target_audience: 'adults',
            language: 'English',
            cancellation_policy: 'Full refund up to 7 days before the event.',
            map_link: 'https://maps.google.com'
        });
        setPhotos([
            { id: 'demo1', url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80' },
            { id: 'demo2', url: 'https://images.unsplash.com/photo-1523961131990-5ea7c61b2107?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80' }
        ]);
        setHighlights([
            'Keynote by leading AI researchers',
            'Hands-on workshop on Agentic Frameworks',
            'Networking with tech founders'
        ]);
        setIncludes(['Accommodation for 2 nights', 'All meals', 'Workshop materials', 'WiFi access']);
        setExcludes(['Travel to the venue', 'Personal expenses']);
        setThingsToCarry(['Laptop', 'Notebook', 'Comfortable clothing']);
        setImportantNotes('Please bring your own laptop for the workshops.');
        setItinerary([
            {
                day: 1,
                title: 'Arrival and Keynotes',
                description: 'Arrive at the retreat, check-in, and attend the opening keynotes on the future of AI.',
                name: 'Main Hall',
                elevation: '500m',
                distance: '0km',
                landmark: 'Retreat Center',
                lat: '37.7749',
                lng: '-122.4194'
            },
            {
                day: 2,
                title: 'Deep Dive Workshops',
                description: 'Full day of hands-on workshops building autonomous agents.',
                name: 'Workshop Rooms',
                elevation: '500m',
                distance: '0km',
                landmark: 'Retreat Center',
                lat: '37.7749',
                lng: '-122.4194'
            }
        ]);
        setPlacesToVisit([
            {
                title: 'Tech Innovation Hub',
                location: 'Main Campus',
                image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=800&q=80',
                description: 'Explore the latest AI startups and their demos.',
                details: ''
            }
        ]);
        setIncludedStay({
            title: 'Mountain View Lodge',
            location: 'Silicon Valley Mountains',
            image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
            gallery: [],
            amenities: ['High-speed WiFi', 'Ergonomic Workspace', 'Pool'],
            description: 'A comfortable lodge surrounded by nature, perfect for focused work and relaxation.',
            long_description: 'The Mountain View Lodge offers premium accommodation with all the amenities needed for a productive yet relaxing retreat.'
        });
        
        addToast('AI Demo data filled successfully', 'success');
    };

    const addItineraryDay = () => {
        setItinerary([...itinerary, { title: '', description: '', lat: '', lng: '', name: '', elevation: '', landmark: '', distance: '' }]);
    };
    const updateItineraryDay = (index: number, field: string, value: string) => {
        const newItinerary = [...itinerary];
        newItinerary[index] = { ...newItinerary[index], [field]: value };
        setItinerary(newItinerary);
    };
    const removeItineraryDay = (index: number) => {
        const newItinerary = [...itinerary];
        newItinerary.splice(index, 1);
        setItinerary(newItinerary);
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

    const handleSubmit = async (e?: React.FormEvent, forceStatus?: string) => {
        if (e) e.preventDefault();
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
                price: formData.price === '' ? null : Number(formData.price),
                total_spots: formData.total_spots === '' ? null : Number(formData.total_spots),
                available_spots: formData.available_spots === '' ? null : Number(formData.available_spots),
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
                host_id: user.id,
                seo_title: formData.seo_title,
                seo_description: formData.seo_description,
                seo_keywords: formData.seo_keywords,
                seo_image_url: formData.seo_image_url
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
                console.error("Save failed response:", errorData);
                throw new Error(errorData.details || errorData.error || 'Failed to save experience');
            }
            
            addToast(`Experience ${existingExperience ? 'updated' : 'created'} successfully`, 'success');
            onSuccess();
        } catch (error: any) {
            console.error('Error saving experience:', error);
            addToast(error.message || 'Failed to save experience', 'error');
        } finally {
            setSaving(false);
        }
    };

    if (showPreview) {
        const draftExperience: Experience = {
            id: existingExperience?.id || 999999,
            host_id: user?.id || 0,
            title: formData.title || 'Untitled Experience',
            description: formData.description || 'No description provided.',
            destination: formData.destination || 'Destination',
            departure_location: formData.departure_location || 'Departure Location',
            start_date: formData.start_date || new Date().toISOString(),
            end_date: formData.end_date || new Date().toISOString(),
            start_time: formData.start_time,
            end_time: formData.end_time,
            price: Number(formData.price) || 0,
            total_spots: Number(formData.total_spots) || 0,
            available_spots: Number(formData.available_spots) || Number(formData.total_spots) || 0,
            status: formData.status as any,
            target_audience: formData.target_audience as any,
            language: formData.language,
            cancellation_policy: formData.cancellation_policy,
            map_link: formData.map_link,
            itinerary,
            includes,
            excludes,
            image_urls: photos.map(p => p.url),
            video_urls: videoUrls,
            places_to_visit: placesToVisit,
            included_stay: includedStay,
            highlights,
            things_to_carry: thingsToCarry,
            important_notes: importantNotes
        };

        return (
            <div className="fixed inset-0 z-[100] bg-white overflow-hidden flex flex-col">
                <div className="sticky top-0 z-50 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between shadow-sm gap-4">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setShowPreview(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors flex items-center gap-2 font-semibold text-gray-700">
                            <ChevronLeft className="w-5 h-5" />
                            <span className="hidden md:inline">Back to Edit</span>
                        </button>
                        <div className="border-l border-gray-300 pl-4 flex items-center">
                            <span className="bg-amber-100 text-amber-800 text-xs font-black uppercase tracking-wider px-2 py-1 rounded-md flex items-center gap-1"><Eye className="w-3 h-3" /> Draft Preview</span>
                        </div>
                    </div>
                    <button onClick={() => {
                        setShowPreview(false);
                        handleSubmit(undefined, 'draft');
                    }} disabled={saving} className="px-6 py-2.5 md:px-8 md:py-3 bg-white border-2 border-gray-200 text-gray-700 rounded-full font-bold hover:bg-gray-50 transition-all disabled:opacity-50">
                        Save as Draft
                    </button>
                    <button onClick={() => {
                        setShowPreview(false);
                        handleSubmit(undefined, 'published');
                    }} disabled={saving} className="px-6 py-2.5 md:px-8 md:py-3 bg-gray-900 text-white rounded-full font-bold shadow-lg shadow-black/10 hover:bg-black hover:shadow-black/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 flex items-center gap-2">
                        {saving ? (
                            <> <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Saving... </>
                        ) : (
                            existingExperience ? 'Save Changes' : 'Publish Experience'
                        )}
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto relative pointer-events-auto">
                    <ExperienceDetails 
                        experience={draftExperience} 
                        onBack={() => setShowPreview(false)} 
                        onRequestAuth={() => {
                            addToast("You can't book your own draft preview.", 'info');
                        }} 
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 pb-32 font-sans selection:bg-[#0284C7]/20 selection:text-[#0284C7]">
            <div className="flex items-center mb-10 sticky top-0 bg-white/80 backdrop-blur-md z-10 py-4 border-b border-gray-100">
                <button onClick={onBack} className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-100 hover:scale-105 transition-all mr-5">
                    <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">{existingExperience ? 'Edit Experience' : 'Host an Experience'}</h1>
                    <p className="text-gray-500 font-medium mt-1">Design a captivating journey for your guests.</p>
                </div>
                <div className="ml-auto flex items-center gap-4">
                    <button type="button" onClick={fillDemoData} className="px-4 py-2 bg-[#0284C7]/10 text-[#0284C7] rounded-xl font-bold hover:bg-[#0284C7]/20 transition-all flex items-center gap-2 hidden md:flex">
                        <Star className="w-4 h-4" />
                        Autofill AI Demo
                    </button>
                    <button type="button" onClick={() => handleSubmit(undefined, 'draft')} disabled={saving} className="px-6 py-3.5 bg-white border-2 border-gray-200 text-gray-700 rounded-full font-bold hover:bg-gray-50 transition-all hidden md:block">
                        Save as Draft
                    </button>
                    <button type="button" onClick={() => setShowPreview(true)} className="px-6 py-3.5 bg-gray-100 text-gray-900 rounded-full font-bold hover:bg-gray-200 transition-all flex items-center gap-2">
                        <Eye className="w-5 h-5" />
                        Preview
                    </button>
                    <button type="button" onClick={() => handleSubmit(undefined, 'published')} disabled={saving} className="px-8 py-3.5 bg-gray-900 text-white rounded-full font-bold shadow-lg shadow-black/10 hover:bg-black hover:shadow-black/20 hover:-translate-y-0.5 transition-all disabled:opacity-50 hidden md:block">
                        {saving ? 'Saving...' : existingExperience ? 'Save Changes' : 'Publish Experience'}
                    </button>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-12">
                {/* 1. OVERVIEW */}
                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-gray-900">1. Overview</h2>
                        <p className="text-gray-500">The basic details to introduce your experience.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="md:col-span-2">
                            
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-bold text-gray-700">Experience Title</label>
                                    <button 
                                        type="button" 
                                        onClick={async () => {
                                            try {
                                                const token = localStorage.getItem('token');
                                                const res = await fetch('/api/ai/suggest-experience', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                                    body: JSON.stringify({
                                                        category: formData.category,
                                                        city: formData.destination,
                                                        languages: formData.languages,
                                                        difficulty: formData.difficulty
                                                    })
                                                });
                                                if (res.ok) {
                                                    const data = await res.json();
                                                    if (data.title) setFormData(prev => ({...prev, title: data.title}));
                                                    if (data.description) setFormData(prev => ({...prev, description: data.description}));
                                                    if (data.what_to_expect) setWhatToExpect(data.what_to_expect);
                                                }
                                            } catch(e) {
                                                console.error('Exp AI Suggestion failed', e);
                                            }
                                        }}
                                        className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors shadow-sm"
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        Auto-write Details
                                    </button>
                                </div>
                            <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg font-medium" placeholder="e.g. Neon Lights Cyberpunk Tokyo Tour" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Destination (City/Region)</label>
                            <input required type="text" value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" placeholder="e.g. Tokyo, Japan" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Departure Location</label>
                            <input type="text" value={formData.departure_location} onChange={e => setFormData({...formData, departure_location: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" placeholder="e.g. Shinjuku Station" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                            <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium min-h-[150px]" placeholder="Describe what makes this experience magical..."></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Target Audience</label>
                            <select value={formData.target_audience} onChange={e => setFormData({...formData, target_audience: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium bg-white">
                                <option value="all">Everyone</option>
                                <option value="adults">Adults Only</option>
                                <option value="family">Family Friendly</option>
                                <option value="couples">Couples</option>
                                <option value="solo">Solo Travelers</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Language</label>
                            <input type="text" value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" placeholder="e.g. English, Japanese" />
                        </div>
                    </div>
                </div>

                {/* 2. MEDIA */}
                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-purple-500"></div>
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-gray-900">2. Media</h2>
                        <p className="text-gray-500">High-quality photos and videos to showcase your event.</p>
                    </div>
                    
                    <div className="space-y-8">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-4">Gallery Images (First is cover)</label>
                            <PhotoUpload photos={photos} setPhotos={setPhotos} maxPhotos={10} />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Video URLs (Optional)</label>
                            <div className="flex gap-3 mb-4">
                                <input type="text" id="video_input" className="flex-1 p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-purple-500/20 focus:border-purple-500 transition-all font-medium" placeholder="https://youtube.com/..." />
                                <button type="button" onClick={() => {
                                    const input = document.getElementById('video_input') as HTMLInputElement;
                                    if (input && input.value) {
                                        setVideoUrls([...videoUrls, input.value]);
                                        input.value = '';
                                    }
                                }} className="px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-2xl font-bold transition-colors whitespace-nowrap">Add Video</button>
                            </div>
                            {videoUrls.length > 0 && (
                                <div className="flex flex-col gap-3">
                                    {videoUrls.map((url, i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-200">
                                            <span className="text-sm font-medium text-gray-700 truncate">{url}</span>
                                            <button type="button" onClick={() => setVideoUrls(videoUrls.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700 p-2"><Trash2 className="w-4 h-4"/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. LOGISTICS */}
                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-gray-900">3. Logistics & Pricing</h2>
                        <p className="text-gray-500">Set the dates, availability, and pricing details.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Price per Person ($)</label>
                            <input required type="number" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold text-xl text-emerald-600" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Total Spots</label>
                            <input required type="number" min="1" value={formData.total_spots} onChange={e => setFormData({...formData, total_spots: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Available Spots</label>
                            <input required type="number" min="0" value={formData.available_spots} onChange={e => setFormData({...formData, available_spots: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium" />
                        </div>
                        
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Start Date</label>
                            <input required type="date" value={formData.start_date.split('T')[0]} onChange={e => setFormData({...formData, start_date: new Date(e.target.value).toISOString()})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium bg-white" />
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">End Date</label>
                            <input required type="date" value={formData.end_date.split('T')[0]} onChange={e => setFormData({...formData, end_date: new Date(e.target.value).toISOString()})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium bg-white" />
                        </div>

                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Start Time</label>
                            <input type="time" value={formData.start_time || ''} onChange={e => setFormData({...formData, start_time: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium bg-white" />
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">End Time</label>
                            <input type="time" value={formData.end_time || ''} onChange={e => setFormData({...formData, end_time: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium bg-white" />
                        </div>

                        <div className="lg:col-span-4">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Meeting Point Map Link (Google Maps)</label>
                            <input type="text" value={formData.map_link || ''} onChange={e => setFormData({...formData, map_link: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium" placeholder="https://maps.app.goo.gl/..." />
                        </div>
                    </div>
                </div>

                {/* 4. HIGHLIGHTS & CHECKLIST */}
                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-amber-500"></div>
                    <div className="mb-8">
                        <h2 className="text-2xl font-black text-gray-900">4. Highlights & Details</h2>
                        <p className="text-gray-500">What makes it special and what to prepare.</p>
                    </div>
                    
                    <div className="space-y-8">
                        {/* Highlights */}
                        <div className="bg-amber-50/50 p-6 rounded-2xl border border-amber-100">
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500"/> Highlights</label>
                            <div className="flex gap-2 mb-4">
                                <input type="text" value={newHighlight} onChange={(e) => setNewHighlight(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newHighlight.trim()) { setHighlights([...highlights, newHighlight.trim()]); setNewHighlight(''); } } }} className="flex-1 p-3 border border-amber-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 font-medium bg-white" placeholder="e.g. Campfire with Music" />
                                <button type="button" onClick={() => { if (newHighlight.trim()) { setHighlights([...highlights, newHighlight.trim()]); setNewHighlight(''); } }} className="px-6 py-3 bg-amber-500 text-white rounded-xl font-bold">Add</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {highlights.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-white border border-amber-200 px-3 py-1.5 rounded-lg shadow-sm">
                                        <span className="text-sm font-medium text-gray-800">{item}</span>
                                        <button type="button" onClick={() => { const n = [...highlights]; n.splice(idx,1); setHighlights(n); }} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500"/> What's Included</label>
                                <div className="flex gap-2 mb-4">
                                    <input type="text" id="inc_input" className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 bg-white" placeholder="e.g. All Meals" />
                                    <button type="button" onClick={() => { const el=document.getElementById('inc_input') as HTMLInputElement; if(el.value) { setIncludes([...includes, el.value]); el.value=''; } }} className="px-4 bg-gray-100 rounded-xl font-bold text-gray-700">Add</button>
                                </div>
                                <div className="space-y-2">
                                    {includes.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-emerald-50 text-emerald-800 px-4 py-2 rounded-lg text-sm font-medium border border-emerald-100">
                                            {item} <button type="button" onClick={() => setIncludes(includes.filter((_, i) => i !== idx))} className="text-emerald-600 hover:text-red-500"><X className="w-4 h-4"/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><X className="w-4 h-4 text-red-500"/> What's Not Included</label>
                                <div className="flex gap-2 mb-4">
                                    <input type="text" id="exc_input" className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 bg-white" placeholder="e.g. Flights" />
                                    <button type="button" onClick={() => { const el=document.getElementById('exc_input') as HTMLInputElement; if(el.value) { setExcludes([...excludes, el.value]); el.value=''; } }} className="px-4 bg-gray-100 rounded-xl font-bold text-gray-700">Add</button>
                                </div>
                                <div className="space-y-2">
                                    {excludes.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-red-50 text-red-800 px-4 py-2 rounded-lg text-sm font-medium border border-red-100">
                                            {item} <button type="button" onClick={() => setExcludes(excludes.filter((_, i) => i !== idx))} className="text-red-600 hover:text-red-500"><X className="w-4 h-4"/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">🎒 Things to Carry</label>
                            <div className="flex gap-2 mb-4">
                                <input type="text" value={newThingToCarry} onChange={(e) => setNewThingToCarry(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newThingToCarry.trim()) { setThingsToCarry([...thingsToCarry, newThingToCarry.trim()]); setNewThingToCarry(''); } } }} className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 font-medium bg-white" placeholder="e.g. Warm Jacket" />
                                <button type="button" onClick={() => { if (newThingToCarry.trim()) { setThingsToCarry([...thingsToCarry, newThingToCarry.trim()]); setNewThingToCarry(''); } }} className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold">Add</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {thingsToCarry.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg">
                                        <span className="text-sm font-medium text-gray-800">{item}</span>
                                        <button type="button" onClick={() => { const n = [...thingsToCarry]; n.splice(idx,1); setThingsToCarry(n); }} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Important Notes & Cancellation</label>
                            <textarea value={importantNotes} onChange={e => setImportantNotes(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 font-medium mb-4" rows={3} placeholder="Any rules, age restrictions, or warnings..."></textarea>
                            <textarea value={formData.cancellation_policy || ''} onChange={e => setFormData({...formData, cancellation_policy: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 font-medium" rows={2} placeholder="Cancellation Policy (e.g. Free cancellation up to 48 hours before...)"></textarea>
                        </div>
                    </div>
                </div>

                {/* 5. ITINERARY */}
                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">5. The Journey (Itinerary)</h2>
                            <p className="text-gray-500">Break down the experience day by day.</p>
                        </div>
                        <button type="button" onClick={addItineraryDay} className="px-5 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-100 transition-colors">
                            <Plus className="w-4 h-4" /> Add Day
                        </button>
                    </div>
                    
                    <div className="space-y-6">
                        {itinerary.map((day, index) => (
                            <div key={index} className="p-6 border border-indigo-100 rounded-2xl bg-indigo-50/30 relative group">
                                <button type="button" onClick={() => removeItineraryDay(index)} className="absolute top-6 right-6 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-white rounded-full shadow-sm">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Day {index + 1} Title</label>
                                        <input type="text" value={day.title} onChange={(e) => updateItineraryDay(index, 'title', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" placeholder="e.g. Arrival in Manali" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Description</label>
                                        <textarea value={day.description} onChange={(e) => updateItineraryDay(index, 'description', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" rows={2} placeholder="Brief description of the day's activities" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Station / Highlight Point</label>
                                        <input type="text" value={day.name || ''} onChange={(e) => updateItineraryDay(index, 'name', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. Vythiri Forest Ridge" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Elevation / Altitude</label>
                                        <input type="text" value={day.elevation || ''} onChange={(e) => updateItineraryDay(index, 'elevation', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. 700m" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Transit Distance</label>
                                        <input type="text" value={day.distance || ''} onChange={(e) => updateItineraryDay(index, 'distance', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. 15 km by Jeep" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Latitude (Map Pin)</label>
                                        <input type="text" value={day.lat || ''} onChange={(e) => updateItineraryDay(index, 'lat', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. 11.5362° N" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Longitude (Map Pin)</label>
                                        <input type="text" value={day.lng || ''} onChange={(e) => updateItineraryDay(index, 'lng', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. 76.0841° E" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Station Landmark</label>
                                        <input type="text" value={day.landmark || ''} onChange={(e) => updateItineraryDay(index, 'landmark', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. Near Lake" />
                                    </div>
                                </div>
                            </div>
                        ))}
                        {itinerary.length === 0 && (
                            <div className="text-center p-8 border-2 border-dashed border-gray-200 rounded-2xl text-gray-500 font-medium">
                                No days added to the itinerary yet.
                            </div>
                        )}
                    </div>
                </div>

                {/* 6. PLACES TO VISIT */}
                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-rose-500"></div>
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">6. Places to Visit (Destinations)</h2>
                            <p className="text-gray-500">Key spots covered in this experience.</p>
                        </div>
                        <button type="button" onClick={() => setPlacesToVisit([...placesToVisit, { title: '', location: '', image: '', description: '', details: '' }])} className="px-5 py-2.5 bg-rose-50 text-rose-700 rounded-xl font-bold flex items-center gap-2 hover:bg-rose-100 transition-colors">
                            <Plus className="w-4 h-4" /> Add Place
                        </button>
                    </div>
                    
                    <div className="space-y-6">
                        {placesToVisit.map((place, index) => (
                            <div key={index} className="p-6 border border-rose-100 rounded-2xl bg-rose-50/30 relative group">
                                <button type="button" onClick={() => { const n = [...placesToVisit]; n.splice(index,1); setPlacesToVisit(n); }} className="absolute top-6 right-6 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-white rounded-full shadow-sm">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase tracking-wider mb-2">Place Title</label>
                                        <input type="text" value={place.title} onChange={e => { const n = [...placesToVisit]; n[index].title = e.target.value; setPlacesToVisit(n); }} className="w-full p-3 border border-rose-200/50 rounded-xl bg-white font-medium" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase tracking-wider mb-2">Location/Area</label>
                                        <input type="text" value={place.location} onChange={e => { const n = [...placesToVisit]; n[index].location = e.target.value; setPlacesToVisit(n); }} className="w-full p-3 border border-rose-200/50 rounded-xl bg-white font-medium" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase tracking-wider mb-2">Image URL / Upload</label>
                                        <div className="flex gap-2">
                                            <input type="text" value={place.image} onChange={e => { const n = [...placesToVisit]; n[index].image = e.target.value; setPlacesToVisit(n); }} className="flex-1 p-3 border border-rose-200/50 rounded-xl bg-white text-sm" placeholder="https://..." />
                                            <label className="cursor-pointer bg-white border border-rose-200/50 hover:bg-rose-50 px-4 py-3 rounded-xl text-sm font-bold text-rose-700 whitespace-nowrap flex items-center justify-center transition-colors">
                                                Upload
                                                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                                    if (e.target.files?.[0]) {
                                                        try {
                                                            const url = await handleFileUpload(e.target.files[0]);
                                                            const n = [...placesToVisit]; n[index].image = url; setPlacesToVisit(n);
                                                        } catch (err) { addToast('Failed to upload', 'error'); }
                                                    }
                                                }} />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase tracking-wider mb-2">Short Description</label>
                                        <textarea value={place.description} onChange={e => { const n = [...placesToVisit]; n[index].description = e.target.value; setPlacesToVisit(n); }} className="w-full p-3 border border-rose-200/50 rounded-xl bg-white font-medium" rows={2} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 7. STAY DETAILS */}
                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-cyan-500"></div>
                    <div className="mb-8 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">7. Stay Details (Optional)</h2>
                            <p className="text-gray-500">Where guests will be sleeping.</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-cyan-50/30 p-6 rounded-2xl border border-cyan-100">
                        <div>
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase tracking-wider mb-2">Resort/Hotel Title</label>
                            <input type="text" value={includedStay?.title || ''} onChange={e => setIncludedStay({...includedStay, title: e.target.value})} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white font-medium" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase tracking-wider mb-2">Location</label>
                            <input type="text" value={includedStay?.location || ''} onChange={e => setIncludedStay({...includedStay, location: e.target.value})} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white font-medium" />
                        </div>
                        
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase tracking-wider mb-2">Primary Image URL / Upload</label>
                            <div className="flex gap-2">
                                <input type="text" value={includedStay?.image || ''} onChange={e => setIncludedStay({...includedStay, image: e.target.value})} className="flex-1 p-3 border border-cyan-200/50 rounded-xl bg-white text-sm" placeholder="https://..." />
                                <label className="cursor-pointer bg-white border border-cyan-200/50 hover:bg-cyan-50 px-4 py-3 rounded-xl text-sm font-bold text-cyan-700 whitespace-nowrap flex items-center justify-center">
                                    Upload
                                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                        if (e.target.files?.[0]) {
                                            try {
                                                const url = await handleFileUpload(e.target.files[0]);
                                                setIncludedStay({...includedStay, image: url});
                                            } catch (err) { addToast('Failed to upload', 'error'); }
                                        }
                                    }} />
                                </label>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase tracking-wider mb-2">Gallery Image URLs (Comma separated)</label>
                            <div className="flex gap-2">
                                <input type="text" value={includedStay?.gallery?.join(', ') || ''} onChange={e => setIncludedStay({...includedStay, gallery: e.target.value.split(',').map(a => a.trim()).filter(a => a)})} className="flex-1 p-3 border border-cyan-200/50 rounded-xl bg-white text-sm" placeholder="https://..." />
                                <label className="cursor-pointer bg-white border border-cyan-200/50 hover:bg-cyan-50 px-4 py-3 rounded-xl text-sm font-bold text-cyan-700 whitespace-nowrap flex items-center justify-center">
                                    Upload
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                            try {
                                                const newUrls = await Promise.all(Array.from(e.target.files).map((f: any) => handleFileUpload(f)));
                                                setIncludedStay({...includedStay, gallery: [...(includedStay?.gallery || []), ...newUrls]});
                                            } catch (err) { addToast('Failed', 'error'); }
                                        }
                                    }} />
                                </label>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase tracking-wider mb-2">Short Description</label>
                            <textarea value={includedStay?.description || ''} onChange={e => setIncludedStay({...includedStay, description: e.target.value})} rows={2} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white font-medium" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase tracking-wider mb-2">Long Description (Detailed)</label>
                            <textarea value={includedStay?.long_description || ''} onChange={e => setIncludedStay({...includedStay, long_description: e.target.value})} rows={3} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white font-medium" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase tracking-wider mb-2">Amenities (Comma separated)</label>
                            <input type="text" value={includedStay?.amenities?.join(', ') || ''} onChange={e => setIncludedStay({...includedStay, amenities: e.target.value.split(',').map(a => a.trim()).filter(a => a)})} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white text-sm" placeholder="WiFi, Pool, Spa..." />
                        </div>
                    </div>
                </div>

                <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
                    <div className="mb-8 flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">8. SEO Settings (Optional)</h2>
                            <p className="text-gray-500">Configure how this experience appears in search engines and social media.</p>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">SEO Title</label>
                            <input type="text" value={formData.seo_title} onChange={e => setFormData({...formData, seo_title: e.target.value})} className="w-full p-3 rounded-xl border border-gray-300" placeholder="Custom SEO Title" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">SEO Description</label>
                            <textarea rows={2} value={formData.seo_description} onChange={e => setFormData({...formData, seo_description: e.target.value})} className="w-full p-3 rounded-xl border border-gray-300" placeholder="Custom SEO Description"></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">SEO Keywords</label>
                            <input type="text" value={formData.seo_keywords} onChange={e => setFormData({...formData, seo_keywords: e.target.value})} className="w-full p-3 rounded-xl border border-gray-300" placeholder="e.g. adventure, trekking, himalayas" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Social Sharing Image URL</label>
                            <input type="text" value={formData.seo_image_url} onChange={e => setFormData({...formData, seo_image_url: e.target.value})} className="w-full p-3 rounded-xl border border-gray-300" placeholder="https://..." />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4 pt-8">
                    <button type="button" onClick={() => handleSubmit(undefined, 'draft')} disabled={saving} className="px-8 py-4 bg-white border-2 border-gray-200 text-gray-700 rounded-full font-bold text-lg hover:bg-gray-50 transition-all">
                        Save as Draft
                    </button>
                    <button type="button" onClick={() => setShowPreview(true)} className="px-8 py-4 bg-gray-100 text-gray-900 rounded-full font-bold text-lg hover:bg-gray-200 transition-all flex items-center gap-2">
                        <Eye className="w-5 h-5" />
                        Preview
                    </button>
                    <button type="button" onClick={(e) => handleSubmit(e, 'published')} disabled={saving} className="px-10 py-4 bg-gray-900 text-white rounded-full font-black text-lg shadow-xl shadow-black/10 hover:bg-black hover:shadow-black/20 hover:-translate-y-1 transition-all disabled:opacity-50 flex items-center gap-2">
                        {saving ? (
                            <> <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Saving... </>
                        ) : (
                            existingExperience ? 'Save Changes' : 'Publish Experience'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
