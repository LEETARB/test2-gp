import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import MainPage from './pages/MainPage';
import AdminPage from './pages/AdminPage';
import CompanyDetailsPage from './pages/CompanyDetailsPage';
import AddPage from './pages/AddPage';
import StatisticsPage from './pages/StatisticsPage';
import HistoryPage from './pages/HistoryPage';
import DetailPage from './pages/DetailPage';
import NewContractPage from './pages/NewContractPage';
import UserOrganizationsPage from './pages/UserOrganizationsPage';

const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
};

const RequireAuth = ({ children }) => {
  const user = getStoredUser();
  if (!user) return <Navigate to="/" replace />;
  return children;
};

const RequireAdmin = ({ children }) => {
  const user = getStoredUser();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'admin') return <Navigate to="/main" replace />;
  return children;
};


const RequireUser = ({ children }) => {
  const user = getStoredUser();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== 'user') return <Navigate to="/admin" replace />;
  return children;
};


function App() {
  return (
    <Router>
      <Routes>
        {/* Login only */}
        <Route path="/" element={<LoginPage />} />

        {/* Main pages */}
        <Route
          path="/main"
          element={
            <RequireAuth>
              <MainPage />
            </RequireAuth>
          }
        />

        <Route
          path="/add"
          element={
            <RequireAuth>
              <AddPage />
            </RequireAuth>
          }
        />

        <Route
          path="/new-contract"
          element={
            <RequireAuth>
              <NewContractPage />
            </RequireAuth>
          }
        />

        <Route
          path="/statistics"
          element={
            <RequireAuth>
              <StatisticsPage />
            </RequireAuth>
          }
        />

        <Route
          path="/history"
          element={
            <RequireAuth>
              <HistoryPage />
            </RequireAuth>
          }
        />

        <Route
          path="/detail/:id"
          element={
            <RequireAuth>
              <DetailPage />
            </RequireAuth>
          }
        />

        <Route
          path="/payment/:id"
          element={
            <RequireAuth>
              <DetailPage />
            </RequireAuth>
          }
        />

        <Route
          path="/organizations-management"
          element={
            <RequireUser>
              <UserOrganizationsPage />
            </RequireUser>
          }
        />

        <Route
          path="/edit/:id"
          element={
            <RequireAuth>
              <DetailPage />
            </RequireAuth>
          }
        />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminPage />
            </RequireAdmin>
          }
        />

        <Route
          path="/admin/company/:id"
          element={
            <RequireAdmin>
              <CompanyDetailsPage />
            </RequireAdmin>
          }
        />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;