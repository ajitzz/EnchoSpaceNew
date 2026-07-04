import React, { useState } from 'react';
import { useToast } from './ToastContext';
import { useAuth } from './AuthContext';

interface AdminSEOTabProps {
    items: any[];
    type: 'listing' | 'experience';
    onSuccess?: () => void;
}

export const AdminSEOTab: React.FC<AdminSEOTabProps> = ({ items, type, onSuccess }) => {
    const { addToast } = useToast();
    const { token } = useAuth();
    const [editingId, setEditingId] = useState<number | null>(null);
    const [formData, setFormData] = useState({ title: '', description: '', keywords: '', og_image: '', canonical_url: '' });
    const [saving, setSaving] = useState(false);
    const [loadingData, setLoadingData] = useState(false);
    
    // local cache of loaded SEO config to show in table
    const [seoCache, setSeoCache] = useState<Record<number, any>>({});

    const handleEdit = async (item: any) => {
        if (editingId === item.id) {
            setEditingId(null);
            return;
        }
        
        setEditingId(item.id);
        setLoadingData(true);
        
        try {
            const res = await fetch(`/api/admin/seo/${type}/${item.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setFormData({
                    title: item.seo_title || '',
                    description: item.seo_description || '',
                    keywords: item.seo_keywords || '',
                    og_image: item.seo_image_url || '',
                    canonical_url: data.canonical_url || ''
                });
                setSeoCache(prev => ({...prev, [item.id]: data}));
            } else {
                setFormData({ title: '', description: '', keywords: '', og_image: '', canonical_url: '' });
            }
        } catch (error) {
            console.error(error);
            addToast('Failed to load SEO data', 'error');
            setFormData({ title: '', description: '', keywords: '', og_image: '', canonical_url: '' });
        } finally {
            setLoadingData(false);
        }
    };

    const handleSave = async (id: number) => {
        setSaving(true);
        try {
            const item = items.find(i => i.id === id);
            const payload = item ? {
                ...item,
                seo_title: formData.title,
                seo_description: formData.description,
                seo_keywords: formData.keywords,
                seo_image_url: formData.og_image
            } : formData;

            const endpoint = type === 'listing' ? `/api/listings/${id}` : `/api/experiences/${id}`;
            const res = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                addToast('SEO metadata updated successfully', 'success');
                if (onSuccess) onSuccess();
                setEditingId(null);
                if (onSuccess) onSuccess();
            } else {
                addToast('Failed to update SEO metadata', 'error');
            }
        } catch (error) {
            console.error(error);
            addToast('An error occurred', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">SEO Override Management</h2>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">{type === 'listing' ? 'Listing' : 'Experience'}</th>
                            <th className="px-6 py-4">Custom SEO Title</th>
                            <th className="px-6 py-4">Custom SEO Description</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {items.map((item) => {
                            const seoData = { title: item.seo_title, description: item.seo_description };
                            return (
                                <React.Fragment key={item.id}>
                                    <tr className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-900 line-clamp-1">{item.title}</div>
                                            <div className="text-gray-500 text-xs mt-1">ID: {item.id}</div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 truncate max-w-[200px]">
                                            {seoData?.title ? seoData.title : <span className="text-gray-400 italic">No override</span>}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 truncate max-w-[300px]">
                                            {seoData?.description ? seoData.description : <span className="text-gray-400 italic">No override</span>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => handleEdit(item)}
                                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-50 transition-colors"
                                            >
                                                {editingId === item.id ? 'Cancel' : 'Edit'}
                                            </button>
                                        </td>
                                    </tr>
                                    {editingId === item.id && (
                                        <tr className="bg-gray-50/50 border-t-0">
                                            <td colSpan={4} className="px-6 py-6">
                                                {loadingData ? (
                                                    <div className="text-center text-sm text-gray-500 py-4">Loading...</div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Custom Meta Title</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={formData.title}
                                                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                                                    className="w-full text-sm border border-gray-300 rounded-md shadow-sm focus:ring-[#0284C7] focus:border-[#0284C7] p-2"
                                                                    placeholder="Leave blank for default..."
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Meta Keywords</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={formData.keywords}
                                                                    onChange={e => setFormData({...formData, keywords: e.target.value})}
                                                                    className="w-full text-sm border border-gray-300 rounded-md shadow-sm focus:ring-[#0284C7] focus:border-[#0284C7] p-2"
                                                                    placeholder="e.g. luxury villa, ocean view"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Canonical URL</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={formData.canonical_url}
                                                                    onChange={e => setFormData({...formData, canonical_url: e.target.value})}
                                                                    className="w-full text-sm border border-gray-300 rounded-md shadow-sm focus:ring-[#0284C7] focus:border-[#0284C7] p-2"
                                                                    placeholder="https://..."
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="space-y-4">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Custom Meta Description</label>
                                                                <textarea 
                                                                    rows={3}
                                                                    value={formData.description}
                                                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                                                    className="w-full text-sm border border-gray-300 rounded-md shadow-sm focus:ring-[#0284C7] focus:border-[#0284C7] p-2"
                                                                    placeholder="Leave blank for default description..."
                                                                ></textarea>
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Open Graph (OG) Image URL</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={formData.og_image}
                                                                    onChange={e => setFormData({...formData, og_image: e.target.value})}
                                                                    className="w-full text-sm border border-gray-300 rounded-md shadow-sm focus:ring-[#0284C7] focus:border-[#0284C7] p-2"
                                                                    placeholder="https://..."
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="col-span-1 md:col-span-2 flex justify-end mt-2">
                                                            <button 
                                                                disabled={saving}
                                                                onClick={() => handleSave(item.id)}
                                                                className="px-4 py-2 bg-[#0284C7] text-white text-sm font-medium rounded-md hover:bg-[#0369A1] transition-colors disabled:opacity-50"
                                                            >
                                                                {saving ? 'Saving...' : 'Save Override'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
