'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Collection, SchemaProperty } from '@/types';
import AddDataModal from '@/components/AddDataModal';
import ViewRecordModal from '@/components/ViewRecordModal';
import EditDataModal from '@/components/EditDataModal';
import JsonModal from '@/components/JsonModal';
import Tooltip from '@/components/Tooltip';
import { useNotifications } from '@/contexts/NotificationContext';
import { apiFetch } from '@/lib/api-client';
import { generateExampleRecord } from '@/lib/schema-utils';
import './records-table.css';

interface CollectionMetadata {
  count: number;
  size: number;
  firstWrite: Date;
  lastWrite: Date;
  schema: Record<string, unknown>;
}

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const collectionId = params.id as string;
  const { addNotification } = useNotifications();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [metadata, setMetadata] = useState<CollectionMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [showAddDataModal, setShowAddDataModal] = useState(false);
  const [viewingRecord, setViewingRecord] = useState<any>(null);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [showSchemaModal, setShowSchemaModal] = useState(false);
  const [showEncryptedData, setShowEncryptedData] = useState(false);
  const [showExampleModal, setShowExampleModal] = useState(false);

  useEffect(() => {
    if (!collectionId) return;

    const fetchCollectionData = async () => {
      try {
        setLoading(true);
        setRecordsLoading(true);

        // Fetch collection metadata
        const metadataResponse = await apiFetch(
          `/api/collections/${collectionId}`
        );
        if (!metadataResponse.ok) {
          throw new Error(
            `Failed to fetch collection: ${metadataResponse.status}`
          );
        }

        const metadataData = await metadataResponse.json();
        if (!metadataData.success) {
          throw new Error(metadataData.error || 'Failed to fetch collection');
        }

        // Create collection object with available data from API
        const schema = metadataData.schema;

        const collectionData: Collection = {
          _id: collectionId,
          name: metadataData.collectionInfo.name,
          type: metadataData.collectionInfo.type,
          schema: schema,
          description: `Created: ${
            metadataData.metadata.first_write
              ? new Date(metadataData.metadata.first_write).toLocaleDateString()
              : 'Unknown'
          }`,
          createdAt:
            metadataData.metadata.first_write || new Date().toISOString(),
        };

        setCollection(collectionData);
        setMetadata({
          count: metadataData.metadata.count,
          size: metadataData.metadata.size,
          firstWrite: metadataData.metadata.first_write
            ? new Date(metadataData.metadata.first_write)
            : new Date(),
          lastWrite: metadataData.metadata.last_write
            ? new Date(metadataData.metadata.last_write)
            : new Date(),
          schema: schema,
        });

      } catch (err) {
        // Failed to load collection data
        setError(
          err instanceof Error ? err.message : 'Failed to load collection'
        );
      } finally {
        setLoading(false);
        setRecordsLoading(false);
      }
    };

    fetchCollectionData();
  }, [collectionId]);

  useEffect(() => {
    if (!collectionId || !collection) return;
    fetchRecords(showEncryptedData);
  }, [collectionId, collection, showEncryptedData]);

  const fetchCollectionMetadata = async () => {
    try {
      // Fetch collection metadata to update stats
      const metadataResponse = await apiFetch(
        `/api/collections/${collectionId}`
      );
      if (metadataResponse.ok) {
        const metadataData = await metadataResponse.json();
        if (metadataData.success) {
          setMetadata({
            count: metadataData.metadata.count,
            size: metadataData.metadata.size,
            firstWrite: metadataData.metadata.first_write
              ? new Date(metadataData.metadata.first_write)
              : new Date(),
            lastWrite: metadataData.metadata.last_write
              ? new Date(metadataData.metadata.last_write)
              : new Date(),
            schema: metadataData.schema,
          });
        }
      }
    } catch (err) {
      // Failed to refresh metadata
    }
  };

  const fetchRecords = async (reveal: boolean = showEncryptedData) => {
    try {
      setRecordsLoading(true);
      setRecordsError(null);

      const response = await apiFetch(
        `/api/data/${collectionId}${reveal ? '?reveal=1' : ''}`
      );
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch records');
      }

      setRecords(data.data || []);
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setRecordsLoading(false);
    }
  };

  const refreshData = async () => {
    // Refresh both records and metadata
    await Promise.all([fetchRecords(showEncryptedData), fetchCollectionMetadata()]);
  };

  const handleEdit = (record: any) => {
    setEditingRecord(record);
  };

  // Check if collection has any encrypted fields
  const hasEncryptedFields = () => {
    if (!collection?.schema?.items?.properties) return false;
    return Object.values(collection.schema.items.properties).some(
      (property: any) =>
        property.type === 'object' && property.properties?.['%share']
    );
  };

  // Helper to format complex data for table display
  const formatValueForTable = (
    value: any,
    property: SchemaProperty
  ): React.ReactNode => {
    if (value === undefined || value === null) {
      return <span className="text-nillion-text-secondary italic">-</span>;
    }

    // Handle encrypted fields
    const isEncrypted =
      property.type === 'object' && property.properties?.['%share'];
    if (isEncrypted) {
      if (!showEncryptedData) {
        return (
          <span className="text-nillion-text-secondary font-mono">***</span>
        );
      }
      // When showing encrypted data, display the actual decrypted value
      // The value here is the decrypted content, not an object
      if (typeof value === 'string') {
        const stringValue = String(value);
        if (stringValue.length > 50) {
          return <span title={stringValue}>{stringValue.slice(0, 47)}...</span>;
        }
        return <span>{stringValue}</span>;
      } else if (typeof value === 'number') {
        return <span className="font-mono">{value}</span>;
      } else if (typeof value === 'boolean') {
        return (
          <span className="nillion-badge nillion-small">
            {value ? 'True' : 'False'}
          </span>
        );
      }
      // For other types, convert to string
      return <span>{String(value)}</span>;
    }

    // Handle different data types
    switch (property.type) {
      case 'array':
        if (Array.isArray(value)) {
          const itemCount = value.length;
          if (itemCount === 0) {
            return (
              <span className="text-nillion-text-secondary italic">
                Empty array
              </span>
            );
          }

          // Show array length and preview of first item
          let preview = '';
          if (itemCount > 0 && property.items) {
            const firstItem = value[0];
            if (property.items.type === 'object') {
              // For object items, show a key count or key names
              if (firstItem && typeof firstItem === 'object') {
                const keys = Object.keys(firstItem);
                preview =
                  keys.length > 0
                    ? ` {${keys.slice(0, 2).join(', ')}${
                        keys.length > 2 ? '...' : ''
                      }}`
                    : ' {}';
              }
            } else if (property.items.type === 'string') {
              preview = firstItem
                ? ` "${String(firstItem).slice(0, 20)}${
                    String(firstItem).length > 20 ? '...' : ''
                  }"`
                : '';
            } else {
              preview = firstItem !== undefined ? ` ${String(firstItem)}` : '';
            }
          }

          return (
            <span>
              <span className="nillion-badge nillion-small">
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </span>
              {preview && (
                <span className="text-xs text-nillion-text-secondary ml-1">
                  {preview}
                </span>
              )}
            </span>
          );
        }
        return (
          <span className="text-nillion-text-secondary italic">
            Invalid array
          </span>
        );

      case 'object':
        if (value && typeof value === 'object') {
          const keys = Object.keys(value);
          if (keys.length === 0) {
            return (
              <span className="text-nillion-text-secondary italic">
                Empty object
              </span>
            );
          }

          // Show object with key count and key names
          const keyPreview = keys.slice(0, 3).join(', ');
          const hasMore = keys.length > 3;

          return (
            <span>
              <span className="nillion-badge nillion-small">
                {keys.length} field{keys.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-nillion-text-secondary ml-1">
                {keyPreview}
                {hasMore ? '...' : ''}
              </span>
            </span>
          );
        }
        return (
          <span className="text-nillion-text-secondary italic">
            Invalid object
          </span>
        );

      case 'boolean':
        return (
          <span className="nillion-badge nillion-small">
            {value ? 'True' : 'False'}
          </span>
        );

      case 'number':
      case 'integer':
        return <span className="font-mono">{value}</span>;

      case 'string':
      default:
        const stringValue = String(value);
        if (stringValue.length > 50) {
          return <span title={stringValue}>{stringValue.slice(0, 47)}...</span>;
        }
        return <span>{stringValue}</span>;
    }
  };

  const handleDeleteCollection = async () => {
    if (
      !confirm(
        'Are you sure you want to delete this entire collection? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      const response = await apiFetch(`/api/collections/${collectionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete collection');
      }

      addNotification({
        type: 'success',
        title: 'Collection deleted',
        message: `Collection "${collection?.name}" has been deleted successfully.`,
      });

      // Redirect to collections list
      router.push('/collections');
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Delete failed',
        message:
          err instanceof Error ? err.message : 'Failed to delete collection',
      });
    }
  };

  const handleDelete = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this record?')) {
      return;
    }

    try {
      const response = await apiFetch(
        `/api/data/${collectionId}?filter=${encodeURIComponent(
          JSON.stringify({ _id: recordId })
        )}`,
        { method: 'DELETE' }
      );

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to delete record');
      }

      addNotification({
        type: 'success',
        title: 'Record deleted',
        message: 'The record has been successfully deleted',
      });

      await refreshData();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete record';
      addNotification({
        type: 'error',
        title: 'Delete failed',
        message: errorMessage,
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nillion-primary mx-auto mb-4"></div>
          <p className="text-nillion-text-secondary">Loading collection...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4">Error</h1>
          <p className="text-nillion-text-secondary mb-4">{error}</p>
          <button onClick={() => router.push('/collections')}>
            Back to Collections
          </button>
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="text-center">
          <h1 className="mb-6">Collection Not Found</h1>
          <button onClick={() => router.push('/collections')}>
            Back to Collections
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <div className="container mx-auto px-6 py-1">
        {/* Header */}
        <div className="mb-6">
          <div className="nillion-card">
            {/* Header with name on left, type and buttons on right */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
              <div className="flex-1">
                <h1 className="text-xl mb-2">{collection.name}</h1>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-nillion-text-secondary font-mono">
                    Collection ID: {collection._id}
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(collection._id);
                      addNotification({
                        type: 'success',
                        title: 'ID copied',
                        message: 'Collection ID has been copied to clipboard',
                        duration: 2000,
                      });
                    }}
                    className="nillion-button-secondary nillion-small"
                    title="Copy collection ID"
                  >
                    📋
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="nillion-badge">
                  {collection.type.toUpperCase()}
                </span>
                <button
                  onClick={() => setShowSchemaModal(true)}
                  className="nillion-button-outline nillion-small"
                >
                  View Schema
                </button>
                <button
                  onClick={() => setShowExampleModal(true)}
                  className="nillion-button-outline nillion-small"
                >
                  Example Record Payload
                </button>
                <button
                  onClick={handleDeleteCollection}
                  className="nillion-button-outline nillion-small"
                >
                  Delete Collection
                </button>
              </div>
            </div>

            {/* Stats section */}
            {metadata && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-nillion-border">
                <div>
                  <div className="text-xs text-nillion-text-secondary mb-0.5">
                    Created
                  </div>
                  <div className="text-sm font-medium">
                    {metadata.firstWrite
                      ? new Date(metadata.firstWrite).toLocaleDateString()
                      : 'Unknown'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-nillion-text-secondary mb-0.5">
                    Last Updated
                  </div>
                  <div className="text-sm font-medium">
                    {metadata.lastWrite
                      ? new Date(metadata.lastWrite).toLocaleDateString()
                      : 'Never'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-nillion-text-secondary mb-0.5">
                    Records
                  </div>
                  <div className="text-sm font-medium">{metadata.count}</div>
                </div>
                <div>
                  <div className="text-xs text-nillion-text-secondary mb-0.5">
                    Size
                  </div>
                  <div className="text-sm font-medium">
                    {(metadata.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Records Section */}
        <div className="my-4 nillion-card">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <h3 className="text-lg">Records ({records.length})</h3>
            <div className="flex gap-3">
              <button
                onClick={refreshData}
                disabled={recordsLoading}
                className="nillion-button-outline"
              >
                {recordsLoading ? 'Loading...' : 'Refresh'}
              </button>
              {hasEncryptedFields() && (
                <button
                  onClick={() => setShowEncryptedData(!showEncryptedData)}
                  className="nillion-button-outline"
                  title={
                    showEncryptedData
                      ? 'Hide encrypted data'
                      : 'Show encrypted data'
                  }
                >
                  {showEncryptedData ? '🔒 Hide' : '🔓 Show'}
                </button>
              )}
              <Tooltip
                content="Cannot modify user-owned records"
                disabled={collection?.type === 'owned'}
              >
                <button
                  onClick={() =>
                    collection?.type !== 'owned' && setShowAddDataModal(true)
                  }
                  data-umami-event="create-record"
                  className={
                    collection?.type === 'owned'
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }
                  disabled={collection?.type === 'owned'}
                >
                  Add Data
                </button>
              </Tooltip>
            </div>
          </div>

          {recordsLoading ? (
            <div className="text-center py-6">
              <div className="animate-spin h-8 w-8 border-b-2 border-nillion-primary mx-auto"></div>
              <p className="mt-2 text-sm text-nillion-text-secondary">
                Loading records...
              </p>
            </div>
          ) : recordsError ? (
            <div className="text-center py-8">
              <div className="text-red-600">
                <p className="font-semibold">Error loading records</p>
                <p className="text-sm mt-1">{recordsError}</p>
                <button onClick={refreshData} className="mt-4">
                  Retry
                </button>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 bg-nillion-bg-secondary rounded-lg">
              <div className="text-3xl mb-3 opacity-20">📄</div>
              <h4 className="text-lg mb-2">No records yet</h4>
              <p className="text-sm text-nillion-text-secondary mb-3">
                This collection doesn't contain any records yet.
              </p>
              <Tooltip
                content="Cannot modify user-owned records"
                disabled={collection?.type === 'owned'}
              >
                <button
                  onClick={() =>
                    collection?.type !== 'owned' && setShowAddDataModal(true)
                  }
                  data-umami-event="create-record"
                  className={
                    collection?.type === 'owned'
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }
                  disabled={collection?.type === 'owned'}
                >
                  Add First Record
                </button>
              </Tooltip>
            </div>
          ) : (
            <div className="relative overflow-hidden border border-nillion-border rounded-lg">
              <div className="overflow-x-auto">
                <table className="relative w-full">
                  <thead>
                    <tr className="bg-nillion-bg-secondary">
                      {/* Sticky ID column */}
                      <th className="sticky left-0 z-10 bg-nillion-bg-secondary px-3 py-2 text-left text-xs font-medium text-nillion-text-secondary uppercase tracking-wider border-r border-nillion-border font-heading">
                        ID
                      </th>
                      {/* Dynamic columns for other fields */}
                      {Object.entries(collection.schema.items.properties)
                        .filter(([fieldName]) => fieldName !== '_id')
                        .map(([fieldName, property]) => (
                          <th
                            key={fieldName}
                            className="px-3 py-2 text-left text-xs font-medium text-nillion-text-secondary uppercase tracking-wider whitespace-nowrap font-heading"
                          >
                            {fieldName}
                            {(property as SchemaProperty).type === 'object' &&
                              (property as SchemaProperty).properties?.[
                                '%share'
                              ] && <span className="ml-1">🔒</span>}
                          </th>
                        ))}
                      {/* Sticky Actions column */}
                      <th className="sticky right-0 z-10 bg-nillion-bg-secondary px-3 py-2 text-center text-xs font-medium text-nillion-text-secondary uppercase tracking-wider border-l border-nillion-border font-heading">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-nillion-border">
                    {records.map((record, index) => (
                      <tr
                        key={record._id || index}
                        className="hover:bg-nillion-bg-secondary transition-colors"
                      >
                        {/* Sticky ID cell */}
                        <td className="sticky left-0 z-10 bg-nillion-bg px-3 py-2 text-sm font-mono text-xs border-r border-nillion-border">
                          {record._id || 'N/A'}
                        </td>
                        {/* Dynamic cells for other fields */}
                        {Object.entries(collection.schema.items.properties)
                          .filter(([fieldName]) => fieldName !== '_id')
                          .map(([fieldName, property]) => {
                            const value = record[fieldName];

                            return (
                              <td
                                key={fieldName}
                                className="px-3 py-2 text-sm whitespace-nowrap"
                              >
                                {formatValueForTable(
                                  value,
                                  property as SchemaProperty
                                )}
                              </td>
                            );
                          })}
                        {/* Sticky Actions cell */}
                        <td className="sticky right-0 z-10 bg-nillion-bg px-3 py-2 text-center border-l border-nillion-border">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => setViewingRecord(record)}
                              className="nillion-button-secondary nillion-small"
                              title="View full record"
                            >
                              👁️
                            </button>
                            <Tooltip
                              content="Cannot modify user-owned records"
                              disabled={collection?.type === 'owned'}
                            >
                              <button
                                onClick={() =>
                                  collection?.type !== 'owned' &&
                                  handleEdit(record)
                                }
                                className={`nillion-button-secondary nillion-small ${
                                  collection?.type === 'owned'
                                    ? 'opacity-50 cursor-not-allowed'
                                    : ''
                                }`}
                                disabled={collection?.type === 'owned'}
                              >
                                ✏️
                              </button>
                            </Tooltip>
                            <Tooltip
                              content="Cannot modify user-owned records"
                              disabled={collection?.type === 'owned'}
                            >
                              <button
                                onClick={() =>
                                  collection?.type !== 'owned' &&
                                  handleDelete(record._id)
                                }
                                data-umami-event="delete-record"
                                className={`nillion-button-secondary nillion-small ${
                                  collection?.type === 'owned'
                                    ? 'opacity-50 cursor-not-allowed'
                                    : ''
                                }`}
                                disabled={collection?.type === 'owned'}
                              >
                                🗑️
                              </button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Data Modal */}
      {collection && (
        <AddDataModal
          collection={collection}
          isOpen={showAddDataModal}
          onClose={() => setShowAddDataModal(false)}
          onSuccess={refreshData}
        />
      )}

      {/* View Record Modal */}
      <ViewRecordModal
        record={viewingRecord}
        isOpen={!!viewingRecord}
        onClose={() => setViewingRecord(null)}
      />

      {/* Edit Record Modal */}
      {collection && editingRecord && (
        <EditDataModal
          collection={collection}
          record={editingRecord}
          isOpen={!!editingRecord}
          onClose={() => setEditingRecord(null)}
          onSuccess={refreshData}
        />
      )}

      {/* Schema Modal */}
      {collection && (
        <JsonModal
          title="Collection Schema"
          subtitle={`Schema for ${collection.name}`}
          data={collection.schema}
          isOpen={showSchemaModal}
          onClose={() => setShowSchemaModal(false)}
        />
      )}

      {/* Example Record Modal */}
      {collection && (
        <JsonModal
          title="Example Record Payload"
          subtitle={`Use this record data payload structure with SecretVaultBuilderClient.createStandardData() to add a new record to the "${collection.name}" collection`}
          data={[generateExampleRecord(collection.schema)]}
          isOpen={showExampleModal}
          onClose={() => setShowExampleModal(false)}
          link={{
            text: 'View SecretVaults SDK documentation →',
            href: 'https://docs.nillion.com/build/private-storage/secretvaults',
          }}
        />
      )}
    </div>
  );
}
