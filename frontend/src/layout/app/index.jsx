// AppLayout.jsx
import Navbar from "../../components/Navbar";

const AppLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 min-h-[60vh]">{children}</main>
    </div>
  );
};

export default AppLayout;
