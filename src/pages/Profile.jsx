import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Grid,
  Loading,
  PageHeader,
  Panel,
  Section,
  StatusBadge,
} from "../components/UI.jsx";

import {
  profileApi,
} from "../api.jsx";

import {
  getApiData,
  getErrorMessage,
  formatDateTime,
} from "../utils.js";

import {
  useAuth,
} from "../context.jsx";

/* ============================================================
   PROFILE MODULE
   ------------------------------------------------------------
   Responsibilities:
   - Show authenticated owner/user profile
   - Edit backend-supported profile fields
   - Show account/role information returned by backend
   - Show session/authentication state
   - Never store passwords, tokens or broker credentials
   - Never fabricate profile information
   ============================================================ */

/* ============================================================
   SAFE VALUE HELPERS
   ============================================================ */

function readValue(
  object,
  keys,
  fallback = null
) {
  if (
    !object ||
    typeof object !== "object"
  ) {
    return fallback;
  }

  for (const key of keys) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return fallback;
}

/* ============================================================
   PROFILE NORMALIZATION
   ============================================================ */

function normalizeProfile(
  payload
) {
  const source =
    payload &&
    typeof payload === "object"
      ? payload
      : {};

  return {
    id:
      readValue(
        source,
        [
          "id",
          "user_id",
          "userId",
        ]
      ),

    username:
      readValue(
        source,
        [
          "username",
          "login",
          "user_name",
        ]
      ),

    name:
      readValue(
        source,
        [
          "name",
          "full_name",
          "fullName",
          "display_name",
          "displayName",
        ]
      ),

    firstName:
      readValue(
        source,
        [
          "first_name",
          "firstName",
        ]
      ),

    lastName:
      readValue(
        source,
        [
          "last_name",
          "lastName",
        ]
      ),

    email:
      readValue(
        source,
        [
          "email",
          "email_address",
          "emailAddress",
        ]
      ),

    phone:
      readValue(
        source,
        [
          "phone",
          "phone_number",
          "phoneNumber",
          "mobile",
        ]
      ),

    role:
      readValue(
        source,
        [
          "role",
          "user_role",
        ]
      ),

    status:
      readValue(
        source,
        [
          "status",
          "account_status",
          "accountStatus",
        ]
      ),

    active:
      source.active !== undefined
        ? Boolean(
            source.active
          )
        : source.is_active !==
          undefined
        ? Boolean(
            source.is_active
          )
        : null,

    createdAt:
      readValue(
        source,
        [
          "created_at",
          "createdAt",
          "registered_at",
        ]
      ),

    updatedAt:
      readValue(
        source,
        [
          "updated_at",
          "updatedAt",
        ]
      ),

    lastLogin:
      readValue(
        source,
        [
          "last_login",
          "lastLogin",
          "last_login_at",
          "lastLoginAt",
        ]
      ),

    timezone:
      readValue(
        source,
        [
          "timezone",
          "time_zone",
        ]
      ),

    avatar:
      readValue(
        source,
        [
          "avatar",
          "avatar_url",
          "avatarUrl",
          "profile_image",
          "profileImage",
        ]
      ),

    raw: source,
  };
}

/* ============================================================
   MAIN PAGE
   ============================================================ */

export default function Profile() {
  const {
    user,
    isAuthenticated,
  } = useAuth();

  /* ==========================================================
     STATE
     ========================================================== */

  const [
    profile,
    setProfile,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    editMode,
    setEditMode,
  ] = useState(false);

  /* ==========================================================
     EDITABLE PROFILE STATE
     ========================================================== */

  const [
    form,
    setForm,
  ] = useState({
    name: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    timezone: "",
  });

  /* ==========================================================
     LOAD PROFILE
     ========================================================== */

  const loadProfile =
    useCallback(
      async () => {
        if (!isAuthenticated) {
          setProfile(null);
          return;
        }

        setLoading(true);
        setError("");

        try {
          const method =
            [
              "get",
              "getProfile",
              "me",
              "current",
              "getCurrentProfile",
            ]
              .map(
                (name) =>
                  profileApi?.[name]
              )
              .find(
                (candidate) =>
                  typeof candidate ===
                  "function"
              );

          if (!method) {
            throw new Error(
              "Profile API is not available in the centralized API contract."
            );
          }

          const response =
            await method();

          const data =
            getApiData(
              response
            );

          const normalized =
            normalizeProfile(
              data || user
            );

          setProfile(
            normalized
          );

          setForm({
            name:
              normalized.name ||
              "",
            firstName:
              normalized.firstName ||
              "",
            lastName:
              normalized.lastName ||
              "",
            email:
              normalized.email ||
              "",
            phone:
              normalized.phone ||
              "",
            timezone:
              normalized.timezone ||
              "",
          });
        } catch (
          requestError
        ) {
          /*
           * Do not silently convert an API failure into
           * a fake profile. The authenticated context is
           * used only as a secondary source if available.
           */
          if (user) {
            const fallback =
              normalizeProfile(
                user
              );

            setProfile(
              fallback
            );

            setForm({
              name:
                fallback.name ||
                "",
              firstName:
                fallback.firstName ||
                "",
              lastName:
                fallback.lastName ||
                "",
              email:
                fallback.email ||
                "",
              phone:
                fallback.phone ||
                "",
              timezone:
                fallback.timezone ||
                "",
            });
          } else {
            setProfile(null);
          }

          setError(
            getErrorMessage(
              requestError
            )
          );
        } finally {
          setLoading(false);
        }
      },
      [
        isAuthenticated,
        user,
      ]
    );

  /* ==========================================================
     INITIAL LOAD
     ========================================================== */

  useEffect(() => {
    loadProfile();
  }, [
    loadProfile,
  ]);

  /* ==========================================================
     FORM HANDLER
     ========================================================== */

  const updateField =
    (
      field,
      value
    ) => {
      setForm(
        (current) => ({
          ...current,
          [field]:
            value,
        })
      );
    };

  /* ==========================================================
     SAVE PROFILE
     ========================================================== */

  const saveProfile =
    async () => {
      if (!profile) {
        setError(
          "Profile data is unavailable."
        );
        return;
      }

      setSaving(true);
      setError("");
      setMessage("");

      try {
        const method =
          [
            "update",
            "updateProfile",
            "save",
            "saveProfile",
            "patch",
          ]
            .map(
              (name) =>
                profileApi?.[name]
            )
            .find(
              (candidate) =>
                typeof candidate ===
                "function"
            );

        if (!method) {
          throw new Error(
            "Profile update API is not available in the centralized API contract."
          );
        }

        const payload = {
          name:
            form.name.trim() ||
            undefined,

          first_name:
            form.firstName.trim() ||
            undefined,

          last_name:
            form.lastName.trim() ||
            undefined,

          email:
            form.email.trim() ||
            undefined,

          phone:
            form.phone.trim() ||
            undefined,

          timezone:
            form.timezone.trim() ||
            undefined,
        };

        const response =
          await method(
            payload
          );

        const updatedData =
          getApiData(
            response
          );

        /*
         * Prefer the actual backend response.
         * If the endpoint returns no body, refresh the
         * profile rather than pretending the update succeeded.
         */
        if (
          updatedData &&
          typeof updatedData ===
            "object"
        ) {
          const normalized =
            normalizeProfile(
              updatedData
            );

          setProfile(
            normalized
          );

          setForm({
            name:
              normalized.name ||
              "",
            firstName:
              normalized.firstName ||
              "",
            lastName:
              normalized.lastName ||
              "",
            email:
              normalized.email ||
              "",
            phone:
              normalized.phone ||
              "",
            timezone:
              normalized.timezone ||
              "",
          });

          setMessage(
            "Profile updated successfully."
          );

          setEditMode(
            false
          );
        } else {
          await loadProfile();

          setMessage(
            "Profile update request completed and the latest backend profile was loaded."
          );

          setEditMode(
            false
          );
        }
      } catch (
        requestError
      ) {
        setError(
          getErrorMessage(
            requestError
          )
        );
      } finally {
        setSaving(false);
      }
    };

  /* ==========================================================
     CANCEL EDIT
     ========================================================== */

  const cancelEdit =
    () => {
      if (!profile) {
        setEditMode(
          false
        );
        return;
      }

      setForm({
        name:
          profile.name ||
          "",
        firstName:
          profile.firstName ||
          "",
        lastName:
          profile.lastName ||
          "",
        email:
          profile.email ||
          "",
        phone:
          profile.phone ||
          "",
        timezone:
          profile.timezone ||
          "",
      });

      setEditMode(
        false
      );
      setError("");
    };

  /* ==========================================================
     DISPLAY HELPERS
     ========================================================== */

  const displayName =
    useMemo(() => {
      if (!profile) {
        return "Unavailable";
      }

      if (profile.name) {
        return profile.name;
      }

      const combined =
        [
          profile.firstName,
          profile.lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .trim();

      return (
        combined ||
        profile.username ||
        "Unavailable"
      );
    }, [
      profile,
    ]);

  const accountStatus =
    useMemo(() => {
      if (!profile) {
        return null;
      }

      if (
        profile.active ===
        true
      ) {
        return "ACTIVE";
      }

      if (
        profile.active ===
        false
      ) {
        return "DISABLED";
      }

      if (
        profile.status
      ) {
        return String(
          profile.status
        ).toUpperCase();
      }

      return null;
    }, [
      profile,
    ]);

  /* ==========================================================
     AUTHENTICATION GUARD
     ========================================================== */

  if (
    !isAuthenticated
  ) {
    return (
      <div className="page profile-page">
        <PageHeader
          title="Profile"
          subtitle="Authenticated user profile"
        />

        <EmptyState
          title="Authentication required"
          message="Sign in to view your profile."
        />
      </div>
    );
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  return (
    <div className="page profile-page">
      {/* ======================================================
          PAGE HEADER
          ====================================================== */}

      <PageHeader
        title="Profile"
        subtitle="Manage your authenticated platform profile"
        actions={
          <div className="row gap-sm">
            <Badge>
              ACCOUNT
            </Badge>

            <Button
              variant="secondary"
              onClick={
                loadProfile
              }
              loading={
                loading
              }
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ======================================================
          STATUS MESSAGES
          ====================================================== */}

      {message ? (
        <Alert
          variant="success"
          title="Profile"
          message={
            message
          }
        />
      ) : null}

      {error ? (
        <ErrorState
          title="Profile request failed"
          message={
            error
          }
          onRetry={
            loadProfile
          }
        />
      ) : null}

      {/* ======================================================
          PROFILE LOADING
          ====================================================== */}

      {loading &&
      !profile ? (
        <Loading
          label="Loading profile..."
        />
      ) : !profile ? (
        <EmptyState
          title="Profile unavailable"
          message="The backend did not return profile information."
        />
      ) : (
        <>
          {/* ==================================================
              PROFILE SUMMARY
              ================================================== */}

          <Grid columns={3}>
            <Card>
              <div className="eyebrow">
                USER
              </div>

              <h2>
                {displayName}
              </h2>

              <div className="muted">
                {profile.username ||
                  "Username unavailable"}
              </div>
            </Card>

            <Card>
              <div className="eyebrow">
                ROLE
              </div>

              <h2>
                {profile.role
                  ? String(
                      profile.role
                    ).toUpperCase()
                  : "Unavailable"}
              </h2>

              <div className="muted">
                Backend-reported role
              </div>
            </Card>

            <Card>
              <div className="eyebrow">
                STATUS
              </div>

              <div className="mt-sm">
                {accountStatus ? (
                  <StatusBadge
                    status={
                      accountStatus
                    }
                  />
                ) : (
                  <Badge>
                    UNAVAILABLE
                  </Badge>
                )}
              </div>

              <div className="muted mt-sm">
                Backend-reported account state
              </div>
            </Card>
          </Grid>

          {/* ==================================================
              PROFILE INFORMATION
              ================================================== */}

          <Panel>
            <Section
              title="Profile Information"
              description="Personal profile fields supported by the backend."
              actions={
                !editMode ? (
                  <Button
                    variant="primary"
                    onClick={() =>
                      setEditMode(
                        true
                      )
                    }
                  >
                    Edit Profile
                  </Button>
                ) : null
              }
            >
              {editMode ? (
                <>
                  <Grid columns={2}>
                    <div>
                      <label className="field-label">
                        Display Name
                      </label>

                      <input
                        className="input"
                        value={
                          form.name
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "name",
                            event.target.value
                          )
                        }
                        autoComplete="name"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        First Name
                      </label>

                      <input
                        className="input"
                        value={
                          form.firstName
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "firstName",
                            event.target.value
                          )
                        }
                        autoComplete="given-name"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        Last Name
                      </label>

                      <input
                        className="input"
                        value={
                          form.lastName
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "lastName",
                            event.target.value
                          )
                        }
                        autoComplete="family-name"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        Email
                      </label>

                      <input
                        className="input"
                        type="email"
                        value={
                          form.email
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "email",
                            event.target.value
                          )
                        }
                        autoComplete="email"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        Phone
                      </label>

                      <input
                        className="input"
                        type="tel"
                        value={
                          form.phone
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "phone",
                            event.target.value
                          )
                        }
                        autoComplete="tel"
                      />
                    </div>

                    <div>
                      <label className="field-label">
                        Timezone
                      </label>

                      <input
                        className="input"
                        value={
                          form.timezone
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "timezone",
                            event.target.value
                          )
                        }
                        placeholder="Backend-supported timezone"
                      />
                    </div>
                  </Grid>

                  <div className="form-actions mt-md">
                    <Button
                      variant="primary"
                      onClick={
                        saveProfile
                      }
                      loading={
                        saving
                      }
                    >
                      Save Changes
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={
                        cancelEdit
                      }
                      disabled={
                        saving
                      }
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <div className="detail-grid">
                  <div>
                    <div className="eyebrow">
                      DISPLAY NAME
                    </div>
                    <div className="detail-value">
                      {displayName}
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow">
                      USERNAME
                    </div>
                    <div className="detail-value">
                      {profile.username ||
                        "Unavailable"}
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow">
                      EMAIL
                    </div>
                    <div className="detail-value">
                      {profile.email ||
                        "Unavailable"}
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow">
                      PHONE
                    </div>
                    <div className="detail-value">
                      {profile.phone ||
                        "Unavailable"}
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow">
                      ROLE
                    </div>
                    <div className="detail-value">
                      {profile.role ||
                        "Unavailable"}
                    </div>
                  </div>

                  <div>
                    <div className="eyebrow">
                      TIMEZONE
                    </div>
                    <div className="detail-value">
                      {profile.timezone ||
                        "Unavailable"}
                    </div>
                  </div>
                </div>
              )}
            </Section>
          </Panel>

          {/* ==================================================
              ACCOUNT METADATA
              ================================================== */}

          <Panel>
            <Section
              title="Account Information"
              description="Read-only metadata returned by the backend."
            >
              <div className="detail-grid">
                <div>
                  <div className="eyebrow">
                    USER ID
                  </div>

                  <div className="detail-value">
                    {profile.id ||
                      "Unavailable"}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    ACCOUNT STATUS
                  </div>

                  <div className="detail-value">
                    {accountStatus ||
                      "Unavailable"}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    CREATED
                  </div>

                  <div className="detail-value">
                    {profile.createdAt
                      ? formatDateTime(
                          profile.createdAt
                        )
                      : "Unavailable"}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    LAST UPDATED
                  </div>

                  <div className="detail-value">
                    {profile.updatedAt
                      ? formatDateTime(
                          profile.updatedAt
                        )
                      : "Unavailable"}
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    LAST LOGIN
                  </div>

                  <div className="detail-value">
                    {profile.lastLogin
                      ? formatDateTime(
                          profile.lastLogin
                        )
                      : "Unavailable"}
                  </div>
                </div>
              </div>
            </Section>
          </Panel>

          {/* ==================================================
              SECURITY INFORMATION
              ================================================== */}

          <Card>
            <Section
              title="Security"
              description="Sensitive authentication and broker credentials are intentionally not editable or displayed here."
            >
              <div className="detail-grid">
                <div>
                  <div className="eyebrow">
                    SESSION
                  </div>

                  <div className="detail-value">
                    <StatusBadge status="ACTIVE" />
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    PASSWORD
                  </div>

                  <div className="detail-value">
                    Managed by authentication backend
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    BROKER CREDENTIALS
                  </div>

                  <div className="detail-value">
                    Managed separately in Broker
                  </div>
                </div>

                <div>
                  <div className="eyebrow">
                    TOKENS / SECRETS
                  </div>

                  <div className="detail-value">
                    Never displayed or stored by this page
                  </div>
                </div>
              </div>
            </Section>
          </Card>
        </>
      )}
    </div>
  );
}
