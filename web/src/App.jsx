import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth, homeFor } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Layout from './components/Layout.jsx';
import RequireRole from './components/RequireRole.jsx';
import { Spinner } from './components/ui.jsx';

import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import CalendarConnected from './pages/CalendarConnected.jsx';

import PatientDashboard from './pages/patient/Dashboard.jsx';
import FindDoctor from './pages/patient/FindDoctor.jsx';
import BookDoctor from './pages/patient/BookDoctor.jsx';
import PatientAppointments from './pages/patient/Appointments.jsx';
import PatientAppointmentDetail from './pages/patient/AppointmentDetail.jsx';
import Medications from './pages/patient/Medications.jsx';

import DoctorToday from './pages/doctor/Today.jsx';
import DoctorSchedule from './pages/doctor/Schedule.jsx';
import DoctorLeave from './pages/doctor/Leave.jsx';
import DoctorProfile from './pages/doctor/Profile.jsx';

import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminDoctors from './pages/admin/Doctors.jsx';
import AdminDoctorForm from './pages/admin/DoctorForm.jsx';
import AdminAppointments from './pages/admin/Appointments.jsx';
import AdminOperations from './pages/admin/Operations.jsx';

/** Sends a signed-in user to their portal, and everyone else to the login page. */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading clinic session…" />;
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

function NotFound() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-3xl font-extrabold text-slate-900">404</h1>
      <p className="mt-2 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <a href={user ? homeFor(user.role) : '/login'} className="btn-primary mt-6">
        Return to Dashboard
      </a>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/calendar/connected" element={<CalendarConnected />} />

            {/* Patient portal */}
            <Route
              path="/patient"
              element={
                <RequireRole roles={['PATIENT']}>
                  <Layout />
                </RequireRole>
              }
            >
              <Route index element={<PatientDashboard />} />
              <Route path="find" element={<FindDoctor />} />
              <Route path="doctors/:doctorId" element={<BookDoctor />} />
              <Route path="appointments" element={<PatientAppointments />} />
              <Route path="appointments/:appointmentId" element={<PatientAppointmentDetail />} />
              <Route path="medications" element={<Medications />} />
            </Route>

            {/* Doctor portal */}
            <Route
              path="/doctor"
              element={
                <RequireRole roles={['DOCTOR']}>
                  <Layout />
                </RequireRole>
              }
            >
              <Route index element={<DoctorToday />} />
              <Route path="schedule" element={<DoctorSchedule />} />
              <Route path="leave" element={<DoctorLeave />} />
              <Route path="profile" element={<DoctorProfile />} />
              <Route path="appointments/:appointmentId" element={<DoctorToday />} />
            </Route>

            {/* Administration */}
            <Route
              path="/admin"
              element={
                <RequireRole roles={['ADMIN']}>
                  <Layout />
                </RequireRole>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="doctors" element={<AdminDoctors />} />
              <Route path="doctors/new" element={<AdminDoctorForm />} />
              <Route path="doctors/:doctorId" element={<AdminDoctorForm />} />
              <Route path="appointments" element={<AdminAppointments />} />
              <Route path="operations" element={<AdminOperations />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
