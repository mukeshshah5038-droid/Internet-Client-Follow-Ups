/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  Calendar, 
  Users, 
  CheckCircle2, 
  Plus, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Bell, 
  LogOut, 
  ChevronRight,
  Search,
  AlertCircle,
  BrainCircuit,
  Settings,
  Menu,
  X,
  Trash2,
  Smartphone,
  CalendarDays
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, isToday, isFuture, isPast, addMinutes, parseISO } from 'date-fns';
import ReactMarkdown from 'react-markdown';

import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { Customer, Appointment, FollowUp, CustomerStatus, AppointmentStatus, FollowUpStatus } from './types';
import { generateFollowUpSuggestion, summarizeDay, generateReminderMessage } from './services/geminiService';

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon, disabled = false, size = 'md', type = 'button' }: any) => {
  const variants: any = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-white border border-slate-200 text-slate-900 hover:bg-slate-50',
    outline: 'border border-slate-300 text-slate-600 hover:bg-slate-50',
    ghost: 'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    sidebar: 'text-slate-400 hover:bg-slate-800 hover:text-white',
    activeSidebar: 'bg-blue-600 text-white',
  };

  const sizes: any = {
    xs: 'px-2 py-1 text-[10px]',
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button 
      id={`btn-${className.replace(/\s+/g, '-')}`}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-md transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {Icon && <Icon size={size === 'xs' ? 12 : 16} />}
      {children}
    </button>
  );
};

const Card = ({ children, title, className = '', headerAction, subTitle }: any) => (
  <div id={`card-${title?.replace(/\s+/g, '-')}`} className={`bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full ${className}`}>
    {(title || headerAction) && (
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <div>
          {title && <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>}
          {subTitle && <p className="text-[10px] text-slate-400 mt-0.5">{subTitle}</p>}
        </div>
        {headerAction}
      </div>
    )}
    <div className="p-4 flex-1 overflow-auto">
      {children}
    </div>
  </div>
);

const Badge = ({ children, color = 'blue' }: any) => {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    yellow: 'bg-amber-50 text-amber-700 border-amber-100',
    gray: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-tight ${colors[color]}`}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<{id: string, message: string, type: string}[]>([]);
  
  // Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  
  // UI State
  const [isAddAppointmentOpen, setAddAppointmentOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState<string | null>(null);
  const [reminderModal, setReminderModal] = useState<{ isOpen: boolean, appointment?: Appointment, message: string }>({ isOpen: false, message: '' });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync with Firestore
  useEffect(() => {
    if (!user) {
      setCustomers([]);
      setAppointments([]);
      setFollowUps([]);
      return;
    }

    const qCustomers = query(collection(db, 'customers'), where('salesRepId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'customers'));

    const qAppointments = query(collection(db, 'appointments'), where('salesRepId', '==', user.uid), orderBy('dateTime', 'asc'));
    const unsubAppointments = onSnapshot(qAppointments, (snapshot) => {
      setAppointments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'appointments'));

    const qFollowUps = query(collection(db, 'follow-ups'), where('salesRepId', '==', user.uid), orderBy('dueDateTime', 'asc'));
    const unsubFollowUps = onSnapshot(qFollowUps, (snapshot) => {
      setFollowUps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FollowUp)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'follow-ups'));

    return () => {
      unsubCustomers();
      unsubAppointments();
      unsubFollowUps();
    };
  }, [user]);

  const stats = useMemo(() => {
    const today = appointments.filter(a => isToday((a.dateTime as Timestamp).toDate()));
    const pendingFollowUps = followUps.filter(f => f.status === 'pending');
    const leads = customers.filter(c => c.status === 'lead').length;
    const completedAppointments = appointments.filter(a => a.status === 'completed').length;
    return { today: today.length, pendingFollowUps: pendingFollowUps.length, leads, won: completedAppointments };
  }, [appointments, followUps, customers]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm) || 
    c.address.toLowerCase().includes(searchTerm.toLowerCase())
  );

   const handleUpdateAppointmentStatus = async (id: string, newStatus: AppointmentStatus) => {
    try {
      const appointment = appointments.find(a => a.id === id);
      if (!appointment) return;

      await updateDoc(doc(db, 'appointments', id), { 
        status: newStatus,
        updatedAt: serverTimestamp()
      });

      // Synchronize customer status based on appointment outcome
      if (appointment.customerId) {
        let newCustomerStatus: CustomerStatus | null = null;
        if (newStatus === 'completed') {
          newCustomerStatus = 'won';
        } else if (newStatus === 'scheduled') {
          newCustomerStatus = 'appointment_scheduled';
        } else if (newStatus === 'cancelled') {
          newCustomerStatus = 'lost';
        }

        if (newCustomerStatus) {
          await updateDoc(doc(db, 'customers', appointment.customerId), { 
            status: newCustomerStatus,
            updatedAt: serverTimestamp()
          });
        }
      }

      setNotifications(prev => [{ 
        id: Date.now().toString(), 
        message: `Appointment marked as ${newStatus}${newStatus === 'completed' ? ' - Deal Closed!' : ''}`, 
        type: newStatus === 'completed' ? 'ai' : 'success' 
      }, ...prev]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'appointments');
    }
  };

  const handleGenerateReminder = async (appointment: Appointment) => {
    const customer = customers.find(c => c.id === appointment.customerId);
    const date = (appointment.dateTime as Timestamp).toDate();
    const timeStr = format(date, 'hh:mm a');
    const dateStr = format(date, 'MMMM do');
    
    setIsSubmitting(true);
    try {
      const message = await generateReminderMessage(
        appointment.customerName || customer?.name || 'Customer',
        dateStr,
        timeStr,
        appointment.location || customer?.address || ''
      );
      
      setReminderModal({ isOpen: true, appointment, message });
    } catch (error) {
      console.error("Reminder gen error:", error);
      const fallback = `Hi ${appointment.customerName || 'there'}, just a reminder of our visit on ${dateStr} at ${timeStr}. See you then!`;
      setReminderModal({ isOpen: true, appointment, message: fallback });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSendReminder = async () => {
    if (!reminderModal.appointment) return;
    const customer = customers.find(c => c.id === reminderModal.appointment?.customerId);
    const phone = customer?.phone || '';
    
    if (phone) {
      // Track in DB
      try {
        await updateDoc(doc(db, 'appointments', reminderModal.appointment.id!), {
          lastReminderSent: serverTimestamp()
        });
      } catch (e) {
        console.error("Failed to track reminder", e);
      }
      
      // Open SMS app
      window.location.href = `sms:${phone}?body=${encodeURIComponent(reminderModal.message)}`;
      setReminderModal({ ...reminderModal, isOpen: false });
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    
    const formData = new FormData(e.target as HTMLFormElement);
    const dateStr = formData.get('dateTime') as string;
    const customerName = formData.get('customerName') as string;
    const phone = formData.get('phone') as string;
    const address = formData.get('address') as string;

    try {
      // 1. Create a lead/prospect record automatically
      const customerData = {
        name: customerName,
        phone: phone,
        address: address,
        status: 'appointment_scheduled',
        notes: 'Created via visit schedule',
        createdAt: serverTimestamp(),
        salesRepId: user.uid,
      };
      
      const customerRef = await addDoc(collection(db, 'customers'), customerData);

      // 2. Schedule the visit
      const newAppointment: Omit<Appointment, 'id'> = {
        customerId: customerRef.id,
        customerName: customerName,
        dateTime: Timestamp.fromDate(new Date(dateStr)),
        location: address,
        internetSpeed: formData.get('internetSpeed') as string,
        hasIPTV: formData.get('hasIPTV') === 'on',
        notes: formData.get('notes') as string,
        status: 'scheduled',
        salesRepId: user.uid,
      };

      const docRef = await addDoc(collection(db, 'appointments'), newAppointment);
      
      // Auto-suggest follow-up
      if (newAppointment.notes) {
        setNotifications(prev => [{ id: Date.now().toString(), message: `New visit for ${customerName} scheduled!`, type: 'info' }, ...prev]);
        const suggestion = await generateFollowUpSuggestion(newAppointment.notes, 'appointment_scheduled');
        if (suggestion) {
           await addDoc(collection(db, 'follow-ups'), {
             customerId: customerRef.id,
             customerName: customerName,
             appointmentId: docRef.id,
             dueDateTime: Timestamp.fromDate(addMinutes(new Date(dateStr), 60 + 1440)), // Default 60 mins offset
             task: suggestion.task,
             status: 'pending',
             salesRepId: user.uid
           });
           setNotifications(prev => [{ id: Date.now().toString(), message: `AI suggested follow-up: ${suggestion.task}`, type: 'ai' }, ...prev]);
        }
      } else {
        setNotifications(prev => [{ id: Date.now().toString(), message: `Visit for ${customerName} scheduled!`, type: 'success' }, ...prev]);
      }

      setAddAppointmentOpen(false);
    } catch (error: any) {
      console.error("Schedule error:", error);
      let errorMessage = "Failed to schedule visit. Please try again.";
      
      if (error.message && error.message.includes('permission-denied')) {
        errorMessage = "Permission denied. Please ensure you are logged in correctly.";
      }
      
      setNotifications(prev => [{ 
        id: Date.now().toString(), 
        message: errorMessage, 
        type: 'error' 
      }, ...prev]);
      
      try {
        handleFirestoreError(error, OperationType.WRITE, 'appointments');
      } catch (e) {
        // Error already handled and notification set
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteFollowUp = async (id: string) => {
    try {
      await updateDoc(doc(db, 'follow-ups', id), { status: 'completed' });
      setNotifications(prev => [{ id: Date.now().toString(), message: 'Follow-up marked as completed.', type: 'success' }, ...prev]);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'follow-ups');
    }
  };

  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove ${name} from your prospects?`)) return;
    try {
      await deleteDoc(doc(db, 'customers', id));
      setNotifications(prev => [{ id: Date.now().toString(), message: `${name} removed from prospects.`, type: 'info' }, ...prev]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'customers');
    }
  };

  const toggleSidebar = () => setSidebarOpen(!isSidebarOpen);

  const handleSummarize = async () => {
    setIsSummarizing(true);
    const today = appointments.filter(a => isToday((a.dateTime as Timestamp).toDate()));
    const result = await summarizeDay(today);
    setAiSummary(result);
    setIsSummarizing(false);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-100">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        >
          <Clock className="text-slate-900" size={32} />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100 p-6">
        <div className="max-w-sm w-full bg-white p-10 rounded-lg shadow-xl border border-slate-200 flex flex-col items-center">
          <div className="w-12 h-12 bg-slate-900 rounded flex items-center justify-center mb-6 shadow-sm">
            <Smartphone className="text-blue-500" size={24} />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-1">ConnectFlow</h1>
          <p className="text-xs text-slate-500 text-center mb-8 uppercase tracking-widest font-bold">Pro Sales Management</p>
          <Button onClick={signInWithGoogle} size="lg" className="w-full" icon={Users}>
            Continue with Google
          </Button>
          <p className="mt-6 text-[10px] text-slate-400 font-medium font-mono uppercase">Unauthorized access is prohibited</p>
        </div>
      </div>
    );
  }

  const NavItem = ({ icon: Icon, label, id }: any) => (
    <button
      onClick={() => { setActiveTab(id); setSidebarOpen(false); }}
      className={`flex items-center gap-3 w-full px-3 py-2 rounded transition-all text-sm font-medium ${activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="h-screen bg-slate-100 flex overflow-hidden font-sans text-slate-900">
      {/* Sidebar - Desktop */}
      <aside className="hidden lg:flex flex-col w-64 bg-slate-900 text-white h-full">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-sm">CF</div>
          <span className="text-lg font-bold tracking-tight">ConnectFlow</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-2 px-2">Main Menu</div>
          <NavItem id="dashboard" icon={Smartphone} label="Dashboard" />
          <NavItem id="prospects" icon={Users} label="Prospects" />
          <NavItem id="appointments" icon={CalendarDays} label="Appointments" />
          <NavItem id="followups" icon={CheckCircle2} label="Follow-up Queue" />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden">
               <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt="Avatar" referrerPolicy="no-referrer" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user.displayName}</p>
              <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-xs !px-2 hover:bg-slate-800 !text-slate-400" onClick={logout} icon={LogOut}>
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleSidebar}
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            className="fixed inset-y-0 left-0 w-64 bg-slate-900 text-white z-50 p-6 flex flex-col lg:hidden"
          >
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center font-bold text-sm">CF</div>
                <span className="text-lg font-bold">ConnectFlow</span>
              </div>
              <button onClick={toggleSidebar} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <nav className="flex-1 space-y-1">
            <NavItem id="dashboard" icon={Smartphone} label="Dashboard" />
            <NavItem id="prospects" icon={Users} label="Prospects" />
            <NavItem id="appointments" icon={CalendarDays} label="Appointments" />
            <NavItem id="followups" icon={CheckCircle2} label="Follow-up Queue" />
            </nav>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-auto flex flex-col bg-slate-100">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-1.5 hover:bg-slate-100 rounded text-slate-600" onClick={toggleSidebar}><Menu size={18} /></button>
            <h1 className="text-sm font-semibold capitalize">{activeTab.replace('-', ' ')} Summary</h1>
            <Badge color="green">Live Sync</Badge>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative group hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text" 
                placeholder="Find customer..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-100 border-none rounded text-xs focus:ring-1 focus:ring-blue-500 w-48 transition-all"
              />
            </div>
            
            <button className="p-1.5 text-slate-400 hover:text-slate-900 transition-all relative">
              <Bell size={18} />
              {stats.pendingFollowUps > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full" />}
            </button>
          </div>
        </header>

        <div className="p-6 max-w-full">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { id: 'appointments', label: 'Today Apps', value: stats.today, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { id: 'followups', label: 'Follow-ups', value: stats.pendingFollowUps, icon: CheckCircle2, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { id: 'prospects', label: 'Leads', value: stats.leads, icon: Search, color: 'text-slate-600', bg: 'bg-slate-100' },
                    { id: 'prospects', label: 'Closed', value: stats.won, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
                  ].map((s, i) => (
                    <motion.div 
                      key={s.label}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setActiveTab(s.id)}
                      className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-1 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{s.label}</span>
                        <div className={`${s.bg} ${s.color} p-1 rounded`}>
                          <s.icon size={14} />
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-slate-900">{s.value}</span>
                    </motion.div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-12 gap-6">
                  {/* Today's Schedule */}
                  <div className="lg:col-span-8">
                    <Card 
                      title="Today's Appointments" 
                      subTitle={`${appointments.filter(a => isToday((a.dateTime as Timestamp).toDate())).length} Visits Scheduled`}
                      headerAction={
                        <Button variant="ghost" size="xs" icon={Plus} onClick={() => { setAddAppointmentOpen(true); }}>Add New</Button>
                      }
                    >
                      <div className="-mx-4 -my-4 overflow-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="text-[11px] font-bold text-slate-400 border-b border-slate-100">
                              <th className="px-4 py-2">TIME</th>
                              <th className="px-4 py-2">CUSTOMER</th>
                              <th className="px-4 py-2">LOCATION / PLAN</th>
                              <th className="px-4 py-2">STATUS</th>
                              <th className="px-4 py-2 text-right">ACTIONS</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs">
                            {appointments.filter(a => isToday((a.dateTime as Timestamp).toDate())).length === 0 ? (
                              <tr>
                                <td colSpan={5} className="py-10 text-center text-slate-400 italic">No appointments for today.</td>
                              </tr>
                            ) : (
                              appointments.filter(a => isToday((a.dateTime as Timestamp).toDate())).map((a) => (
                                <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors group">
                                  <td className="px-4 py-3 font-mono text-blue-600 font-medium">
                                    {format((a.dateTime as Timestamp).toDate(), 'hh:mm a')}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-slate-900">{a.customerName}</div>
                                    <div className="text-[10px] text-slate-400">ID: {a.id?.slice(0, 8)}</div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-600">
                                    <div>{a.location}</div>
                                    {(a.internetSpeed || a.hasIPTV) && (
                                      <div className="text-[9px] font-bold text-blue-500 mt-1 uppercase flex gap-2">
                                        {a.internetSpeed && <span>{a.internetSpeed}</span>}
                                        {a.hasIPTV && <span className="text-purple-500">IPTV</span>}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge color={
                                      a.status === 'scheduled' ? 'blue' : 
                                      a.status === 'completed' ? 'green' : 
                                      a.status === 'cancelled' ? 'red' : 'slate'
                                    }>
                                      {a.status}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {a.status === 'scheduled' && (
                                      <div className="flex justify-end gap-2">
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); handleGenerateReminder(a); }}
                                          className={`p-1.5 rounded transition-colors ${a.lastReminderSent ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                          disabled={isSubmitting}
                                          title={a.lastReminderSent ? "Resend Reminder" : "Send Reminder"}
                                        >
                                          <Bell size={14} className={isSubmitting ? 'animate-pulse' : ''} />
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); handleUpdateAppointmentStatus(a.id!, 'completed'); }}
                                          className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                                          title="Mark Completed"
                                        >
                                          <CheckCircle2 size={14} />
                                        </button>
                                        <button 
                                          onClick={(e) => { e.stopPropagation(); handleUpdateAppointmentStatus(a.id!, 'cancelled'); }}
                                          className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                                          title="Cancel"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    )}
                                    {a.status !== 'scheduled' && (
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleUpdateAppointmentStatus(a.id!, 'scheduled'); }}
                                        className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors"
                                      >
                                        Reset to Pending
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>

                  {/* Right Column: AI & Task Queue */}
                  <div className="lg:col-span-4 space-y-6">
                    <Card title="AI Sales Copilot" className="bg-slate-900 text-white border-transparent">
                      <div className="space-y-4">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                           <BrainCircuit size={14} className="text-blue-500" />
                           Insights & Strategy
                        </div>
                        
                        {aiSummary ? (
                          <div className="prose prose-sm prose-invert max-h-48 overflow-auto mb-4 custom-scrollbar text-xs leading-relaxed text-slate-300">
                            <ReactMarkdown>{aiSummary}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="h-20 flex items-center justify-center text-slate-600 italic text-xs border border-dashed border-slate-800 rounded-lg">
                            Ready for analysis...
                          </div>
                        )}
                        
                        <Button 
                          variant="primary" 
                          size="sm"
                          className="w-full"
                          onClick={handleSummarize}
                          disabled={isSummarizing}
                        >
                          {isSummarizing ? 'Analyzing...' : 'Generate Daily Brief'}
                        </Button>
                      </div>
                    </Card>

                    <Card title="Follow-up Queue" subTitle={`${stats.pendingFollowUps} Pending Actions`}>
                      <div className="space-y-3">
                        {followUps.filter(f => f.status === 'pending').slice(0, 4).map(f => (
                          <div key={f.id} className="p-3 border-l-2 border-amber-500 bg-amber-50/50 rounded flex flex-col gap-1 transition-all hover:bg-amber-50">
                            <div className="flex justify-between items-start">
                              <p className="text-xs font-bold text-slate-900">{f.task}</p>
                              <span className="text-[9px] font-bold text-amber-600 uppercase">{format((f.dueDateTime as Timestamp).toDate(), 'MMM d')}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 truncate">{f.customerName}</p>
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => handleCompleteFollowUp(f.id!)} className="text-[10px] font-bold text-blue-600 hover:underline">Mark Done</button>
                            </div>
                          </div>
                        ))}
                        {followUps.filter(f => f.status === 'pending').length === 0 && (
                          <div className="py-4 text-center text-slate-400 italic text-[10px]">No pending follow-ups.</div>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'prospects' && (
              <motion.div 
                key="prospects"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                   <div className="flex items-center gap-4 flex-1">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input 
                          type="text" 
                          placeholder="Search addresses, names or phones..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 border-none rounded text-xs focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                   </div>
                </div>

                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {filteredCustomers.length === 0 ? (
                     <div className="col-span-full py-20 bg-white rounded-lg border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
                        <Users size={32} className="mb-2 opacity-20" />
                        <p className="text-xs">No customers matching your search.</p>
                     </div>
                  ) : (
                    filteredCustomers.map((c) => (
                      <Card key={c.id} className="hover:shadow transition-all group">
                        <div className="flex justify-between items-start mb-3">
                          <div className="w-8 h-8 bg-slate-100 rounded flex items-center justify-center text-slate-700 font-bold text-xs">
                            {c.name.charAt(0)}
                          </div>
                          <Badge color={
                            c.status === 'won' ? 'green' : 
                            c.status === 'lost' ? 'red' : 
                            c.status === 'appointment_scheduled' ? 'blue' : 'yellow'
                          }>
                            {c.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <h4 className="text-sm font-bold mb-1 truncate text-slate-900">{c.name}</h4>
                        <p className="text-[10px] text-slate-500 mb-4 flex items-center gap-1 truncate">
                          <MapPin size={10} className="shrink-0" /> {c.address}
                        </p>
                        
                        <div className="grid grid-cols-2 gap-2 mb-4">
                           <a href={`tel:${c.phone}`} className="flex items-center justify-center py-2 bg-slate-50 rounded border border-slate-100 hover:bg-slate-100 transition-colors text-[10px] font-bold text-slate-700">
                              <Phone size={12} className="mr-1.5" /> Call
                           </a>
                           {c.email ? (
                             <a href={`mailto:${c.email}`} className="flex items-center justify-center py-2 bg-slate-50 rounded border border-slate-100 hover:bg-slate-100 transition-colors text-[10px] font-bold text-slate-700">
                                <Mail size={12} className="mr-1.5" /> Email
                             </a>
                           ) : (
                             <div className="flex items-center justify-center py-2 bg-slate-50 rounded border border-slate-100 opacity-50 text-[10px] font-bold text-slate-400">
                                <Mail size={12} className="mr-1.5" /> N/A
                             </div>
                           )}
                        </div>

                        <div className="pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400">
                           <span>Added {format((c.createdAt as Timestamp).toDate(), 'MMM d, yyyy')}</span>
                           <div className="flex gap-2">
                             <button onClick={() => handleDeleteCustomer(c.id!, c.name)} className="text-red-400 hover:text-red-600 transition-colors">
                               <Trash2 size={12} />
                             </button>
                           </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'followups' && (
              <motion.div 
                key="followups"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card 
                  title="Follow-up Queue" 
                  subTitle="Action required for these prospects"
                >
                   <div className="space-y-2">
                      {followUps.filter(f => f.status === 'pending').length === 0 ? (
                        <div className="py-20 text-center text-slate-400 text-xs italic">All tasks completed. Great job!</div>
                      ) : (
                        followUps.filter(f => f.status === 'pending').map(f => (
                          <div key={f.id} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border border-transparent hover:border-slate-200 transition-all group">
                             <div className="flex items-center gap-4">
                                <div className="w-8 h-8 bg-white rounded flex items-center justify-center shadow-sm border border-slate-100">
                                   <CheckCircle2 className="text-slate-200" size={16} />
                                </div>
                                <div>
                                   <p className="text-xs font-bold text-slate-900">{f.task}</p>
                                   <p className="text-[10px] text-slate-500 uppercase tracking-tight">{f.customerName} • Due {format((f.dueDateTime as Timestamp).toDate(), 'MMM d, h:mm a')}</p>
                                </div>
                             </div>
                             <div className="flex gap-2">
                               <Button size="xs" variant="secondary" onClick={() => handleCompleteFollowUp(f.id!)} className="opacity-0 group-hover:opacity-100">Complete</Button>
                               <Button size="xs" variant="outline" className="opacity-0 group-hover:opacity-100">Snooze</Button>
                             </div>
                          </div>
                        ))
                      )}
                   </div>
                </Card>
              </motion.div>
            )}

            {activeTab === 'appointments' && (
              <motion.div 
                key="appointments"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <Card 
                  title="Full Schedule" 
                  subTitle="Master list of all planned visits"
                  headerAction={<Button size="sm" icon={Plus} onClick={() => { setAddAppointmentOpen(true); }}>New Visit</Button>}
                >
                   <div className="space-y-2">
                      {appointments.length === 0 ? (
                        <div className="py-20 text-center text-slate-400 text-xs italic">Schedule is currently empty.</div>
                      ) : (
                        appointments.map(a => (
                          <div key={a.id} className="p-3 bg-slate-50 rounded-lg flex items-center justify-between border border-transparent hover:border-slate-200 transition-all">
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-white rounded flex flex-col items-center justify-center shadow-sm border border-slate-100">
                                   <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter leading-none">{format((a.dateTime as Timestamp).toDate(), 'MMM')}</span>
                                   <span className="text-sm font-bold text-slate-900">{format((a.dateTime as Timestamp).toDate(), 'd')}</span>
                                </div>
                                <div>
                                   <p className="text-xs font-bold text-slate-900">{a.customerName}</p>
                                   <p className="text-[10px] text-slate-500">{format((a.dateTime as Timestamp).toDate(), 'h:mm a')} • {a.location}</p>
                                   {(a.internetSpeed || a.hasIPTV) && (
                                      <div className="text-[9px] font-bold text-blue-500 mt-0.5 uppercase flex gap-2">
                                        {a.internetSpeed && <span>{a.internetSpeed}</span>}
                                        {a.hasIPTV && <span className="text-purple-500">IPTV</span>}
                                      </div>
                                    )}
                                </div>
                             </div>
                             <div className="flex items-center gap-3">
                                {a.status === 'scheduled' && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleGenerateReminder(a); }}
                                    className={`p-1.5 rounded transition-colors ${a.lastReminderSent ? 'text-amber-500 hover:bg-amber-50' : 'text-blue-500 hover:bg-blue-50'}`}
                                    disabled={isSubmitting}
                                  >
                                    <Bell size={14} className={isSubmitting ? 'animate-pulse' : ''} />
                                  </button>
                                )}
                                <Badge color={a.status === 'scheduled' ? 'blue' : 'green'}>{a.status}</Badge>
                                <button className="p-1 text-slate-400 hover:text-slate-900"><ChevronRight size={14} /></button>
                             </div>
                          </div>
                        ))
                      )}
                   </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Notifications Toast */}
      <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`p-3 rounded-lg shadow-xl border w-64 pointer-events-auto flex gap-3 ${
                n.type === 'ai' ? 'bg-slate-900 text-white border-slate-700' : 
                n.type === 'success' ? 'bg-green-600 text-white border-green-500' :
                'bg-white text-slate-900 border-slate-200'
              }`}
            >
              <div className="shrink-0 pt-0.5">
                {n.type === 'ai' ? <BrainCircuit size={16} className="text-blue-400" /> : <Bell size={16} className="text-slate-400" />}
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold leading-tight">{n.message}</p>
              </div>
              <button 
                onClick={() => setNotifications(prev => prev.filter(nx => nx.id !== n.id))} 
                className="shrink-0 opacity-50 hover:opacity-100 self-start"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isAddAppointmentOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAddAppointmentOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-white rounded-lg w-full max-w-md overflow-hidden relative shadow-2xl border border-slate-200"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Schedule New Visit</h3>
                <button onClick={() => setAddAppointmentOpen(false)} className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"><X/></button>
              </div>
              <form onSubmit={handleAddAppointment} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Customer Name</label>
                    <input name="customerName" required placeholder="Full Name" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Mobile Number</label>
                    <input name="phone" required placeholder="000-000-0000" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Service Address</label>
                  <input name="address" required placeholder="Street, City, Zip" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Date & Time</label>
                    <input name="dateTime" type="datetime-local" required className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Specific Location</label>
                    <input name="location" placeholder="Address already on file" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Internet Speed</label>
                    <select name="internetSpeed" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none appearance-none">
                      <option value="">Select Plan</option>
                      <option value="0 - 50">0 - 50</option>
                      <option value="51 - 100">51 - 100</option>
                      <option value="101 - 150">101 - 150</option>
                      <option value="151- 200">151- 200</option>
                      <option value="201 & above">201 & above</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Add-ons</label>
                    <div className="flex items-center gap-2 h-8 px-1">
                      <input type="checkbox" id="hasIPTV" name="hasIPTV" className="w-4 h-4 accent-blue-600 rounded" />
                      <label htmlFor="hasIPTV" className="text-xs text-slate-600 font-medium">Include IPTV Service</label>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-0.5">Appointment Objectives</label>
                    <textarea name="notes" placeholder="e.g. Demonstration of speed, contract review" className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none h-20 resize-none" />
                </div>
                <div className="pt-2">
                   <Button 
                    type="submit" 
                    variant="primary" 
                    className="w-full" 
                    icon={isSubmitting ? undefined : Plus}
                    disabled={isSubmitting}
                   >
                    {isSubmitting ? 'Scheduling...' : 'Confirm Visit Schedule'}
                   </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {reminderModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setReminderModal({ ...reminderModal, isOpen: false })}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-white rounded-lg w-full max-w-md overflow-hidden relative shadow-2xl border border-slate-200"
            >
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded">
                    <Bell size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">Send Visit Reminder</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">AI Generated Message</p>
                  </div>
                </div>
                <button onClick={() => setReminderModal({ ...reminderModal, isOpen: false })} className="p-1 hover:bg-slate-200 rounded text-slate-400 transition-colors"><X size={18}/></button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-xs text-slate-700 leading-relaxed italic">"{reminderModal.message}"</p>
                </div>
                
                <div className="space-y-2">
                   <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
                      <Smartphone size={12} />
                      Sending to {customers.find(c => c.id === reminderModal.appointment?.customerId)?.phone}
                   </div>
                   <Button variant="primary" className="w-full" onClick={onSendReminder} icon={Smartphone}>
                      Send to Customer SMS
                   </Button>
                   <p className="text-[9px] text-center text-slate-400 italic">This will open your default messaging app</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}

