import React, { useState, useEffect } from 'react';
import { Compass, Image as ImageIcon, Settings2, Plus, Trash2, Calendar, MapPin, IndianRupee, Users, CheckCircle2, ChevronLeft, Sparkles, Upload } from 'lucide-react';
import { useToast } from './ToastContext';
import { useCurrency } from './CurrencyContext';
import { PhotoUpload } from './PhotoUpload';

interface AdminExperiencesProps {
  token: string;
}

export const AdminExperiences: React.FC<AdminExperiencesProps> = ({ token }) => {
  const [activeTab, setActiveTab] = useState<'listings' | 'design'>('listings');
  const [experiences, setExperiences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();
  const { formatPrice } = useCurrency();

  const [heroSettings, setHeroSettings] = useState({
    hero_title: 'Unforgettable Experiences',
    hero_subtitle: 'Discover exclusive weekend getaways, cultural tours, and extreme adventures curated by local experts.',
    badge_text: 'Curated Collections',
    hero_image_urls: [] as string[]
  });
  
  const [heroPhotos, setHeroPhotos] = useState<any[]>([]);
  const [savingDesign, setSavingDesign] = useState(false);

  // Experience Form State
  const [editingExperience, setEditingExperience] = useState<any | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expRes, settingsRes] = await Promise.all([
        fetch('/api/experiences'),
        fetch('/api/settings/experiences_page')
      ]);

      if (expRes.ok) {
        setExperiences(await expRes.json());
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setHeroSettings(data);
        if (data.hero_image_urls) {
          setHeroPhotos(data.hero_image_urls.map((url: string, i: number) => ({ id: `img-${i}`, url })));
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveDesign = async () => {
    setSavingDesign(true);
    try {
      // First, upload new images
      const uploadedUrls = [];
      for (const photo of heroPhotos) {
        if (photo.file) {
          const formData = new FormData();
          formData.append('image', photo.file);
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });
          const uploadData = await uploadRes.json();
          uploadedUrls.push(uploadData.url);
        } else {
          uploadedUrls.push(photo.url);
        }
      }

      const newSettings = {
        ...heroSettings,
        hero_image_urls: uploadedUrls
      };

      const res = await fetch('/api/settings/experiences_page', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });

      if (res.ok) {
        addToast("Page design saved successfully", "success");
        setHeroSettings(newSettings);
        setHeroPhotos(newSettings.hero_image_urls.map((url: string, i: number) => ({ id: `img-${i}`, url })));
      }
    } catch (e) {
      console.error(e);
      addToast("Failed to save design", "error");
    } finally {
      setSavingDesign(false);
    }
  };

  const deleteExperience = async (id: number) => {
    if (!confirm('Are you sure you want to delete this experience?')) return;
    try {
      const res = await fetch(`/api/experiences/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setExperiences(experiences.filter(e => e.id !== id));
        addToast('Experience deleted', 'success');
      }
    } catch (e) {
      console.error(e);
      addToast('Failed to delete experience', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {!isFormOpen ? (
        <>
          {/* Sub Tabs */}
          <div className="flex gap-4 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('listings')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'listings' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Manage Experiences
            </button>
            <button
              onClick={() => setActiveTab('design')}
              className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'design' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Page Design
            </button>
          </div>

          {activeTab === 'listings' && (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">All Experiences</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      if (!confirm('This will insert demo data. Continue?')) return;
                      const session = JSON.parse(localStorage.getItem('auth_session') || '{}');
                      try {
                        const res = await fetch('/api/experiences/seed', {
                          method: 'POST',
                          headers: { 'Authorization': `Bearer ${session.token}` }
                        });
                        const data = await res.json();
                        if (data.success) {
                           addToast('Demo data seeded successfully!', 'success');
                           window.location.reload();
                        } else {
                           addToast(data.error || 'Failed to seed data', 'error');
                        }
                      } catch (err) {
                        addToast('Failed to seed data', 'error');
                      }
                    }}
                    className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-emerald-200"
                  >
                    <Sparkles className="w-4 h-4" /> Seed Demo
                  </button>
                  <button
                    onClick={() => {
                      setEditingExperience(null);
                      setIsFormOpen(true);
                    }}
                    className="px-4 py-2 bg-black text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-gray-800"
                  >
                    <Plus className="w-4 h-4" /> Add Experience
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="animate-pulse flex flex-col gap-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
                </div>
              ) : (
                <div className="grid gap-4">
                  {experiences.map(exp => (
                    <div key={exp.id} className="bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                          {exp.image_urls?.[0] ? (
                            <img src={exp.image_urls[0]} alt={exp.title} className="w-full h-full object-cover" />
                          ) : (
                            <Compass className="w-8 h-8 text-gray-300 m-auto mt-4" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{exp.title}</h4>
                          <p className="text-sm text-gray-500">{exp.destination} • {formatPrice(exp.price, 'INR')}/person</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingExperience(exp);
                            setIsFormOpen(true);
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteExperience(exp.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'design' && (
            <div className="flex flex-col gap-6 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">Experiences Page Design</h3>
                <p className="text-sm text-gray-500 mb-6">Customize the hero section of the experiences page.</p>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Hero Title</label>
                  <input
                    type="text"
                    value={heroSettings.hero_title}
                    onChange={(e) => setHeroSettings({...heroSettings, hero_title: e.target.value})}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Hero Subtitle</label>
                  <textarea
                    value={heroSettings.hero_subtitle}
                    onChange={(e) => setHeroSettings({...heroSettings, hero_subtitle: e.target.value})}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Badge Text (e.g., Curated Collections)</label>
                  <input
                    type="text"
                    value={heroSettings.badge_text}
                    onChange={(e) => setHeroSettings({...heroSettings, badge_text: e.target.value})}
                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Hero Background Images (Slider)</label>
                  <PhotoUpload photos={heroPhotos} setPhotos={setHeroPhotos} />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button
                  onClick={saveDesign}
                  disabled={savingDesign}
                  className="px-6 py-2.5 bg-black text-white rounded-lg font-bold disabled:opacity-50 flex items-center gap-2"
                >
                  {savingDesign ? 'Saving...' : 'Save Design'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <ExperienceEditor 
            experience={editingExperience} 
            onClose={() => setIsFormOpen(false)} 
            onSave={() => {
                setIsFormOpen(false);
                fetchData();
            }}
            token={token}
        />
      )}
    </div>
  );
};

interface ExperienceEditorProps {
    experience: any | null;
    onClose: () => void;
    onSave: () => void;
    token: string;
}

const ExperienceEditor: React.FC<ExperienceEditorProps> = ({ experience, onClose, onSave, token }) => {
    const { addToast } = useToast();
    const [saving, setSaving] = useState(false);
    
    const [formData, setFormData] = useState({
        title: experience?.title || '',
        description: experience?.description || '',
        destination: experience?.destination || '',
        departure_location: experience?.departure_location || '',
        start_date: experience?.start_date ? new Date(experience.start_date).toISOString().split('T')[0] : '',
        end_date: experience?.end_date ? new Date(experience.end_date).toISOString().split('T')[0] : '',
        start_time: experience?.start_time || '',
        end_time: experience?.end_time || '',
        price: experience?.price || '',
        total_spots: experience?.total_spots || '',
        available_spots: experience?.available_spots ?? (experience?.total_spots || ''),
        status: experience?.status || 'upcoming',
        target_audience: experience?.target_audience || 'all',
        language: experience?.language || 'English',
        cancellation_policy: experience?.cancellation_policy || '',
        map_link: experience?.map_link || ''
    });

    const [photos, setPhotos] = useState<any[]>(
        experience?.image_urls?.map((url: string, i: number) => ({ id: `img-${i}`, url })) || []
    );

    const [videoUrls, setVideoUrls] = useState<string[]>(experience?.video_urls || []);
    const [newVideoUrl, setNewVideoUrl] = useState('');

    const [itinerary, setItinerary] = useState<any[]>(experience?.itinerary || []);
    const [includes, setIncludes] = useState<string[]>(experience?.includes || []);
    const [newInclude, setNewInclude] = useState('');
    
    const [excludes, setExcludes] = useState<string[]>(experience?.excludes || []);
    const [newExclude, setNewExclude] = useState('');
    
    const [placesToVisit, setPlacesToVisit] = useState<any[]>(experience?.places_to_visit || []);
    const [includedStay, setIncludedStay] = useState<any>(experience?.included_stay || { title: '', location: '', image: '', amenities: [], description: '' });

    const [highlights, setHighlights] = useState<string[]>(experience?.highlights || []);
    const [newHighlight, setNewHighlight] = useState('');
    
    const [thingsToCarry, setThingsToCarry] = useState<string[]>(experience?.things_to_carry || []);
    const [newThingToCarry, setNewThingToCarry] = useState('');
    
    const [importantNotes, setImportantNotes] = useState(experience?.important_notes || '');

    const handleFileUpload = async (file: File) => {
        const token = localStorage.getItem('token');
        const presignRes = await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Upload images first
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
                price: Number(formData.price),
                total_spots: Number(formData.total_spots),
                available_spots: Number(formData.available_spots),
                image_urls: uploadedUrls,
                video_urls: videoUrls,
                itinerary,
                includes,
                excludes,
                places_to_visit: placesToVisit,
                included_stay: includedStay,
                highlights,
                things_to_carry: thingsToCarry,
                important_notes: importantNotes
            };

            const url = experience ? `/api/experiences/${experience.id}` : '/api/experiences';
            const method = experience ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Failed to save experience');
            
            addToast(`Experience ${experience ? 'updated' : 'created'} successfully`, 'success');
            onSave();
        } catch (error) {
            console.error(error);
            addToast('Failed to save experience', 'error');
        } finally {
            setSaving(false);
        }
    };

    const addItineraryDay = () => {
        setItinerary([...itinerary, { day: itinerary.length + 1, title: '', description: '' }]);
    };

    const updateItineraryDay = (index: number, field: string, value: string) => {
        const updated = [...itinerary];
        updated[index] = { ...updated[index], [field]: value };
        setItinerary(updated);
    };

    const removeItineraryDay = (index: number) => {
        const updated = itinerary.filter((_, i) => i !== index);
        setItinerary(updated);
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden font-sans pb-32">
            <div className="flex items-center mb-10 sticky top-0 bg-white/80 backdrop-blur-md z-10 py-4 px-6 border-b border-gray-100">
                <button onClick={onClose} className="w-10 h-10 bg-gray-50 border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-100 hover:scale-105 transition-all mr-5">
                    <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
                <div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight">{experience ? 'Edit Experience' : 'Create Experience'}</h1>
                </div>
                <div className="ml-auto">
                    <button type="button" onClick={handleSubmit} disabled={saving} className="px-6 py-2.5 bg-gray-900 text-white rounded-full font-bold shadow-lg shadow-black/10 hover:bg-black transition-all disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="px-6 space-y-12">
                {/* 1. OVERVIEW */}
                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                    <div className="mb-6">
                        <h2 className="text-xl font-black text-gray-900">1. Overview</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Experience Title</label>
                            <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-lg font-medium" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Destination (City/Region)</label>
                            <input required type="text" value={formData.destination} onChange={e => setFormData({...formData, destination: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Departure Location</label>
                            <input type="text" value={formData.departure_location} onChange={e => setFormData({...formData, departure_location: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                            <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium min-h-[150px]"></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Target Audience</label>
                            <select value={formData.target_audience} onChange={e => setFormData({...formData, target_audience: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium bg-white">
                                <option value="all">Everyone</option>
                                <option value="adults">Adults Only</option>
                                <option value="family">Family Friendly</option>
                                <option value="couples">Couples</option>
                                <option value="solo">Solo Travelers</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Language</label>
                            <input type="text" value={formData.language} onChange={e => setFormData({...formData, language: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium" />
                        </div>
                    </div>
                </div>

                {/* 2. MEDIA */}
                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-500"></div>
                    <div className="mb-6">
                        <h2 className="text-xl font-black text-gray-900">2. Media</h2>
                    </div>
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-4">Gallery Images</label>
                            <PhotoUpload photos={photos} setPhotos={setPhotos}  />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Video URLs / Local Uploads (Optional)</label>
                            
                            {/* Local video uploader for admins */}
                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition-all cursor-pointer relative group mb-4">
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
                                    <div className="p-2.5 bg-white rounded-full shadow-sm text-gray-400 group-hover:text-purple-600 transition-colors">
                                        <Upload className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-bold text-gray-700">Upload a Video Tour File</span>
                                    <span className="text-[10px] text-gray-400">Drag & drop or click to choose (Max 20MB)</span>
                                </div>
                            </div>

                            <div className="relative flex items-center justify-center py-2 mb-2">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-gray-100" />
                                </div>
                                <span className="relative px-3 bg-white text-[10px] font-bold text-gray-400 uppercase tracking-wider">Or paste a link</span>
                            </div>

                            <div className="flex gap-3 mb-4">
                                <input type="text" id="video_input" className="flex-1 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500" placeholder="https://youtube.com/..." />
                                <button type="button" onClick={() => {
                                    const input = document.getElementById('video_input') as HTMLInputElement;
                                    if (input && input.value) { setVideoUrls([...videoUrls, input.value]); input.value = ''; }
                                }} className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-bold transition-colors">Add</button>
                            </div>
                            {videoUrls.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    {videoUrls.map((url, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                                            <span className="text-sm font-medium text-gray-700 truncate">{url}</span>
                                            <button type="button" onClick={() => setVideoUrls(videoUrls.filter((_, idx) => idx !== i))} className="text-red-500"><Trash2 className="w-4 h-4"/></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. LOGISTICS */}
                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                    <div className="mb-6">
                        <h2 className="text-xl font-black text-gray-900">3. Logistics & Pricing</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Price per Person ($)</label>
                            <input required type="number" min="0" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl font-bold text-lg text-emerald-600" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Total Spots</label>
                            <input required type="number" min="1" value={formData.total_spots} onChange={e => setFormData({...formData, total_spots: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl font-medium" />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Available Spots</label>
                            <input required type="number" min="0" value={formData.available_spots} onChange={e => setFormData({...formData, available_spots: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl font-medium" />
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Start Date</label>
                            <input required type="date" value={formData.start_date.split('T')[0]} onChange={e => setFormData({...formData, start_date: new Date(e.target.value).toISOString()})} className="w-full p-3 border border-gray-200 rounded-xl font-medium bg-white" />
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">End Date</label>
                            <input required type="date" value={formData.end_date.split('T')[0]} onChange={e => setFormData({...formData, end_date: new Date(e.target.value).toISOString()})} className="w-full p-3 border border-gray-200 rounded-xl font-medium bg-white" />
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Start Time</label>
                            <input type="time" value={formData.start_time || ''} onChange={e => setFormData({...formData, start_time: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl font-medium bg-white" />
                        </div>
                        <div className="lg:col-span-2">
                            <label className="block text-sm font-bold text-gray-700 mb-2">End Time</label>
                            <input type="time" value={formData.end_time || ''} onChange={e => setFormData({...formData, end_time: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl font-medium bg-white" />
                        </div>
                        <div className="lg:col-span-4">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Meeting Point Map Link (Google Maps)</label>
                            <input type="text" value={formData.map_link || ''} onChange={e => setFormData({...formData, map_link: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl font-medium" />
                        </div>
                        <div className="lg:col-span-4">
                            <label className="block text-sm font-bold text-gray-700 mb-2">Status</label>
                            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl font-medium bg-white">
                                <option value="upcoming">Upcoming</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 4. HIGHLIGHTS & CHECKLIST */}
                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
                    <div className="mb-6">
                        <h2 className="text-xl font-black text-gray-900">4. Highlights & Details</h2>
                    </div>
                    <div className="space-y-8">
                        <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100">
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-amber-500"/> Highlights</label>
                            <div className="flex gap-2 mb-4">
                                <input type="text" value={newHighlight} onChange={(e) => setNewHighlight(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newHighlight.trim()) { setHighlights([...highlights, newHighlight.trim()]); setNewHighlight(''); } } }} className="flex-1 p-3 border border-amber-200 rounded-xl bg-white" placeholder="e.g. Campfire with Music" />
                                <button type="button" onClick={() => { if (newHighlight.trim()) { setHighlights([...highlights, newHighlight.trim()]); setNewHighlight(''); } }} className="px-5 py-2 bg-amber-500 text-white rounded-xl font-bold">Add</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {highlights.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 bg-white border border-amber-200 px-3 py-1 rounded-lg">
                                        <span className="text-sm font-medium text-gray-800">{item}</span>
                                        <button type="button" onClick={() => { const n = [...highlights]; n.splice(idx,1); setHighlights(n); }} className="text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3">What's Included</label>
                                <div className="flex gap-2 mb-4">
                                    <input type="text" id="inc_input" className="flex-1 p-3 border border-gray-200 rounded-xl bg-white" />
                                    <button type="button" onClick={() => { const el=document.getElementById('inc_input') as HTMLInputElement; if(el.value) { setIncludes([...includes, el.value]); el.value=''; } }} className="px-4 bg-gray-100 rounded-xl font-bold text-gray-700">Add</button>
                                </div>
                                <div className="space-y-2">
                                    {includes.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-emerald-50 text-emerald-800 px-4 py-2 rounded-lg text-sm border border-emerald-100">
                                            {item} <button type="button" onClick={() => setIncludes(includes.filter((_, i) => i !== idx))} className="text-emerald-600 hover:text-red-500">X</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-3">What's Not Included</label>
                                <div className="flex gap-2 mb-4">
                                    <input type="text" id="exc_input" className="flex-1 p-3 border border-gray-200 rounded-xl bg-white" />
                                    <button type="button" onClick={() => { const el=document.getElementById('exc_input') as HTMLInputElement; if(el.value) { setExcludes([...excludes, el.value]); el.value=''; } }} className="px-4 bg-gray-100 rounded-xl font-bold text-gray-700">Add</button>
                                </div>
                                <div className="space-y-2">
                                    {excludes.map((item, idx) => (
                                        <div key={idx} className="flex items-center justify-between bg-red-50 text-red-800 px-4 py-2 rounded-lg text-sm border border-red-100">
                                            {item} <button type="button" onClick={() => setExcludes(excludes.filter((_, i) => i !== idx))} className="text-red-600 hover:text-red-500">X</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-3">Things to Carry</label>
                            <div className="flex gap-2 mb-4">
                                <input type="text" value={newThingToCarry} onChange={(e) => setNewThingToCarry(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newThingToCarry.trim()) { setThingsToCarry([...thingsToCarry, newThingToCarry.trim()]); setNewThingToCarry(''); } } }} className="flex-1 p-3 border border-gray-200 rounded-xl bg-white" />
                                <button type="button" onClick={() => { if (newThingToCarry.trim()) { setThingsToCarry([...thingsToCarry, newThingToCarry.trim()]); setNewThingToCarry(''); } }} className="px-5 py-2 bg-gray-900 text-white rounded-xl font-bold">Add</button>
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
                            <textarea value={importantNotes} onChange={e => setImportantNotes(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl mb-4" rows={3}></textarea>
                            <textarea value={formData.cancellation_policy || ''} onChange={e => setFormData({...formData, cancellation_policy: e.target.value})} className="w-full p-3 border border-gray-200 rounded-xl" rows={2} placeholder="Cancellation Policy..."></textarea>
                        </div>
                    </div>
                </div>

                {/* 5. ITINERARY */}
                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-black text-gray-900">5. The Journey (Itinerary)</h2>
                        <button type="button" onClick={addItineraryDay} className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl font-bold flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Add Day
                        </button>
                    </div>
                    <div className="space-y-6">
                        {itinerary.map((day, index) => (
                            <div key={index} className="p-6 border border-indigo-100 rounded-2xl bg-indigo-50/30 relative group">
                                <button type="button" onClick={() => removeItineraryDay(index)} className="absolute top-6 right-6 text-gray-400 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase mb-2">Day {index + 1} Title</label>
                                        <input type="text" value={day.title} onChange={(e) => updateItineraryDay(index, 'title', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase mb-2">Description</label>
                                        <textarea value={day.description} onChange={(e) => updateItineraryDay(index, 'description', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white" rows={2} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase mb-2">Station / Highlight Point</label>
                                        <input type="text" value={day.name || ''} onChange={(e) => updateItineraryDay(index, 'name', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase mb-2">Elevation / Altitude</label>
                                        <input type="text" value={day.elevation || ''} onChange={(e) => updateItineraryDay(index, 'elevation', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase mb-2">Transit Distance</label>
                                        <input type="text" value={day.distance || ''} onChange={(e) => updateItineraryDay(index, 'distance', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase mb-2">Station Landmark</label>
                                        <input type="text" value={day.landmark || ''} onChange={(e) => updateItineraryDay(index, 'landmark', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Latitude (Map Pin)</label>
                                        <input type="text" value={day.lat || ''} onChange={(e) => updateItineraryDay(index, 'lat', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. 11.5362° N" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-indigo-900/60 uppercase tracking-wider mb-2">Longitude (Map Pin)</label>
                                        <input type="text" value={day.lng || ''} onChange={(e) => updateItineraryDay(index, 'lng', e.target.value)} className="w-full p-3 border border-indigo-200/50 rounded-xl bg-white text-sm" placeholder="e.g. 76.0841° E" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 6. PLACES TO VISIT */}
                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-rose-500"></div>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-black text-gray-900">6. Places to Visit</h2>
                        <button type="button" onClick={() => setPlacesToVisit([...placesToVisit, { title: '', location: '', image: '', description: '', details: '' }])} className="px-4 py-2 bg-rose-50 text-rose-700 rounded-xl font-bold flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Add Place
                        </button>
                    </div>
                    <div className="space-y-6">
                        {placesToVisit.map((place, index) => (
                            <div key={index} className="p-6 border border-rose-100 rounded-2xl bg-rose-50/30 relative group">
                                <button type="button" onClick={() => { const n = [...placesToVisit]; n.splice(index,1); setPlacesToVisit(n); }} className="absolute top-6 right-6 text-gray-400 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase mb-2">Place Title</label>
                                        <input type="text" value={place.title} onChange={e => { const n = [...placesToVisit]; n[index].title = e.target.value; setPlacesToVisit(n); }} className="w-full p-3 border border-rose-200/50 rounded-xl bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase mb-2">Location/Area</label>
                                        <input type="text" value={place.location} onChange={e => { const n = [...placesToVisit]; n[index].location = e.target.value; setPlacesToVisit(n); }} className="w-full p-3 border border-rose-200/50 rounded-xl bg-white" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase mb-2">Image URL / Upload</label>
                                        <div className="flex gap-2">
                                            <input type="text" value={place.image} onChange={e => { const n = [...placesToVisit]; n[index].image = e.target.value; setPlacesToVisit(n); }} className="flex-1 p-3 border border-rose-200/50 rounded-xl bg-white text-sm" />
                                            <label className="cursor-pointer bg-white border border-rose-200/50 px-4 py-3 rounded-xl text-sm font-bold text-rose-700 flex items-center">
                                                Upload
                                                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                                    if (e.target.files?.[0]) {
                                                        try { const url = await handleFileUpload(e.target.files[0]); const n = [...placesToVisit]; n[index].image = url; setPlacesToVisit(n); } catch (err) { addToast('Failed', 'error'); }
                                                    }
                                                }} />
                                            </label>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-rose-900/60 uppercase mb-2">Short Description</label>
                                        <textarea value={place.description} onChange={e => { const n = [...placesToVisit]; n[index].description = e.target.value; setPlacesToVisit(n); }} className="w-full p-3 border border-rose-200/50 rounded-xl bg-white" rows={2} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 7. STAY DETAILS */}
                <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500"></div>
                    <div className="mb-6">
                        <h2 className="text-xl font-black text-gray-900">7. Stay Details (Optional)</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-cyan-50/30 p-6 rounded-2xl border border-cyan-100">
                        <div>
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase mb-2">Resort/Hotel Title</label>
                            <input type="text" value={includedStay?.title || ''} onChange={e => setIncludedStay({...includedStay, title: e.target.value})} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase mb-2">Location</label>
                            <input type="text" value={includedStay?.location || ''} onChange={e => setIncludedStay({...includedStay, location: e.target.value})} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase mb-2">Primary Image URL / Upload</label>
                            <div className="flex gap-2">
                                <input type="text" value={includedStay?.image || ''} onChange={e => setIncludedStay({...includedStay, image: e.target.value})} className="flex-1 p-3 border border-cyan-200/50 rounded-xl bg-white text-sm" />
                                <label className="cursor-pointer bg-white border border-cyan-200/50 px-4 py-3 rounded-xl text-sm font-bold text-cyan-700 flex items-center">
                                    Upload
                                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                        if (e.target.files?.[0]) {
                                            try { const url = await handleFileUpload(e.target.files[0]); setIncludedStay({...includedStay, image: url}); } catch (err) { addToast('Failed', 'error'); }
                                        }
                                    }} />
                                </label>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase mb-2">Gallery Image URLs (Comma separated)</label>
                            <div className="flex gap-2">
                                <input type="text" value={includedStay?.gallery?.join(', ') || ''} onChange={e => setIncludedStay({...includedStay, gallery: e.target.value.split(',').map(a => a.trim()).filter(a => a)})} className="flex-1 p-3 border border-cyan-200/50 rounded-xl bg-white text-sm" />
                                <label className="cursor-pointer bg-white border border-cyan-200/50 px-4 py-3 rounded-xl text-sm font-bold text-cyan-700 flex items-center">
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
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase mb-2">Short Description</label>
                            <textarea value={includedStay?.description || ''} onChange={e => setIncludedStay({...includedStay, description: e.target.value})} rows={2} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase mb-2">Long Description (Detailed)</label>
                            <textarea value={includedStay?.long_description || ''} onChange={e => setIncludedStay({...includedStay, long_description: e.target.value})} rows={3} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-cyan-900/60 uppercase mb-2">Amenities (Comma separated)</label>
                            <input type="text" value={includedStay?.amenities?.join(', ') || ''} onChange={e => setIncludedStay({...includedStay, amenities: e.target.value.split(',').map(a => a.trim()).filter(a => a)})} className="w-full p-3 border border-cyan-200/50 rounded-xl bg-white text-sm" />
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};
