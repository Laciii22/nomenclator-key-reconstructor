import React from "react";

const Navbar: React.FC = () => {
    return (
        <nav className="bg-blue-500 sticky top-0 z-50 shadow-md">
            <div className="container mx-auto px-4 py-3">
                <h1 className="text-white text-lg font-bold">
                    HCPortal Semi-Automatic Nomenclator Key Reconstruction module
                </h1>
            </div>
        </nav>
    );
};

export default Navbar;