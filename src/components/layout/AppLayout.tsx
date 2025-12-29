/**
 * AppLayout: Main application layout wrapper.
 * 
 * Provides consistent structure with navbar, main content area, and footer.
 */

import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

type AppLayoutProps = {
    /** Page content */
    children?: React.ReactNode;
    /** Handler for help button click in navbar */
    onHelpClick?: () => void;
};

/**
 * Layout wrapper with header, content, and footer.
 */
const AppLayout: React.FC<AppLayoutProps> = ({ children, onHelpClick }) => {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar onHelpClick={onHelpClick} />
            <main className="flex-grow">{children}</main>
            <Footer />
        </div>
    );
};

export default AppLayout;
