"use client";
import API from "../../../services/api";
import { useState, useEffect } from "react";
import { useRouter, useParams, notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Calendar01Icon,
  Edit03Icon,
  ArrowLeft01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import Navbar from "../../../components/Navbar";
import DashboardTab from "@/components/DashboardTab";
import EventDetails from "./EventDetails";
import Payout from "./Payout";
import Attendees from "./Attendees";
import Confirmation from "./Confirmation";
import Reminder from "./Reminder";
import { Providers } from "@/redux/Providers";

export default function EventDashboard() {
  const params = useParams();
  const { slug } = params;
  const [event, setEvent] = useState(null);
  const [eventError, setEventError] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activePage, setActivePage] = useState("overview");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const router = useRouter();

  let content;
  if (activePage === "overview") {
    content = <EventDetails />;
  } else if (activePage === "attendees") {
    content = <Attendees />;
  } else if (activePage === "confirmation") {
    content = <Confirmation />;
  } else if (activePage === "reminder") {
    content = <Reminder />;
  } else if (activePage === "payout") {
      content = <Payout event={event} />;
  }

  useEffect(() => {
    async function fetchEvent() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const data = await API.getEvent(slug);
        setEvent(data);
      } catch (err) {
        if (err.status === 404) {
          setEventError(true);
        } else {
          setFetchError(err?.message || "Failed to load event.");
        }
      } finally {
        setIsLoading(false);
      }
    }
    if (slug) fetchEvent();
  }, [slug]);

  if (eventError) return notFound();

  const handleDeleteEvent = async () => {
    setIsDeleting(true);
    try {
      await API.deleteEvent(slug);
      toast.success("Event deleted.");
      router.push("/events");
    } catch (err) {
      toast.error(err?.message || "Failed to delete event.");
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleViewEvent = async () => {
    const viewEventLink = `${window.location.origin}/${slug}`;
    try {
      window.open(viewEventLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Error opening event in new window:", err);
    }
  };

  return (
    <Providers>
      <div className="relative min-h-screen bg-white">
        {/* Content wrapper with proper z-index */}
        <div className="relative z-10">
          <Navbar />

          {/* Main container - centered with proper spacing */}
          <div className="min-h-screen flex flex-col items-center pt-4 sm:pt-6 lg:pt-8 pb-8">
            <main className="bg-white w-full sm:w-[90%] md:w-[85%] lg:w-[80%] xl:w-[75%] max-w-7xl rounded-lg p-3 sm:p-4 lg:p-6 shadow-lg">
              {/* Header Section */}
              <div className="w-full mb-4">
                <div className="max-w-full mx-auto">
                  {/* Back Link */}
                  <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4 text-sm"
                  >
                    <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                    Back
                  </button>

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 gap-4 sm:gap-0">
                    <div className="flex items-center space-x-4 w-full sm:w-auto">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 sm:px-6 lg:px-10 py-3 sm:py-4 lg:py-5 w-full sm:w-auto">
                        <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-[#007AFF] text-center sm:text-left uppercase">
                          {event?.name ?? ""}
                        </h1>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 w-full sm:w-auto justify-center sm:justify-end">
                      <button
                        onClick={() => router.push(`/${slug}/edit`)}
                        className="bg-blue-50 text-[#007AFF] px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border-none hover:bg-blue-100 transition-colors flex items-center space-x-3 text-sm sm:text-base lg:text-lg"
                      >
                        <HugeiconsIcon icon={Edit03Icon} size={18} />
                        <span>Edit Event</span>
                      </button>
                      <button
                        onClick={handleViewEvent}
                        className="bg-blue-50 text-[#007AFF] px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border-none hover:bg-blue-100 transition-colors flex items-center space-x-3 text-sm sm:text-base lg:text-lg"
                      >
                        <HugeiconsIcon icon={Calendar01Icon} size={18} />
                        <span>Event Page</span>
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="bg-red-50 text-red-500 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border-none hover:bg-red-100 transition-colors flex items-center space-x-3 text-sm sm:text-base lg:text-lg"
                      >
                        <HugeiconsIcon icon={Delete02Icon} size={18} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dashboard Tabs */}
              <div className="mb-6 w-full">
                <DashboardTab onNavigate={setActivePage} active={activePage} />
              </div>

              {/* Event Details Section */}
              <div>
                {isLoading && !event ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  </div>
                ) : fetchError ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <p className="text-red-500 text-sm">{fetchError}</p>
                    <button
                      onClick={() => {
                        setFetchError(null);
                        setIsLoading(true);
                        API.getEvent(slug)
                          .then((data) => setEvent(data))
                          .catch((err) => {
                            if (err.status === 404) setEventError(true);
                            else setFetchError(err?.message || "Failed to load event.");
                          })
                          .finally(() => setIsLoading(false));
                      }}
                      className="text-sm text-blue-600 underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  content
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Delete event?</h2>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete <span className="font-semibold text-gray-900">{event?.name}</span> and all its data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEvent}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Providers>
  );
}
