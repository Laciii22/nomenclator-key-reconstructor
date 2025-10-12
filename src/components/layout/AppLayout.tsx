import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';

type AppLayoutProps = {
    children?: React.ReactNode;
};

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">{children}</main>
            <Footer />
        </div>
    );
};

export default AppLayout;
