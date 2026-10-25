import React from 'react';
import { Outlet } from 'react-router-dom';
import TopNav from './TopNav';
import MobileTabBar from './MobileTabBar';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink selection:bg-accent-soft selection:text-accent">
      {/* Skip to main content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      <TopNav />

      <main id="main-content" className="flex-1 max-w-[1080px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-24 sm:pb-16">
        <Outlet />
      </main>

      <MobileTabBar />
    </div>
  );
}
