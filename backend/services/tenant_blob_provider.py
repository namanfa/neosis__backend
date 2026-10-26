"""Read-only blob provider interface and Azure Blob implementation."""
from typing import Protocol

from azure.core.exceptions import (
    ClientAuthenticationError,
    HttpResponseError,
    ResourceNotFoundError,
    ServiceRequestError,
    ServiceResponseError,
)
from azure.storage.blob import BlobServiceClient, ContainerClient


RESULTS = {"success", "authentication_failed", "unreachable", "not_found"}


class BlobProvider(Protocol):
    def test_connection(self, connection_string: str) -> str: ...

    def list_blob_metadata(self, connection_string: str): ...


class AzureBlobProvider:
    """Azure adapter that lists container/blob metadata and never reads blob bodies."""

    @staticmethod
    def _client(connection_string):
        # A container SAS URL scopes access to one container. Standard Azure
        # connection strings are account scoped and enumerate its containers.
        if connection_string.strip().lower().startswith("https://"):
            return ContainerClient.from_container_url(connection_string, logging_enable=False)
        return BlobServiceClient.from_connection_string(connection_string, logging_enable=False)

    @staticmethod
    def _result_for_error(error):
        if isinstance(error, ClientAuthenticationError):
            return "authentication_failed"
        if isinstance(error, ResourceNotFoundError):
            return "not_found"
        if isinstance(error, (ServiceRequestError, ServiceResponseError, TimeoutError, OSError)):
            return "unreachable"
        if isinstance(error, HttpResponseError):
            if error.status_code in (401, 403):
                return "authentication_failed"
            if error.status_code == 404:
                return "not_found"
            return "unreachable"
        return "unreachable"

    def result_for_error(self, error):
        """Expose only a fixed classification to the sync state machine."""
        return self._result_for_error(error)

    @staticmethod
    def _read_one_page(pager):
        pages = pager.by_page()
        try:
            return list(next(pages))
        except StopIteration:
            return []

    def test_connection(self, connection_string: str) -> str:
        try:
            client = self._client(connection_string)
            if isinstance(client, ContainerClient):
                # Calling the first page verifies list permission, including for
                # an empty container, without downloading any blob content.
                self._read_one_page(client.list_blobs(results_per_page=1, timeout=15))
                return "success"

            containers = self._read_one_page(client.list_containers(results_per_page=1, timeout=15))
            if not containers:
                return "not_found"
            container = client.get_container_client(containers[0].name)
            self._read_one_page(container.list_blobs(results_per_page=1, timeout=15))
            return "success"
        except Exception as error:
            return self._result_for_error(error)

    def list_blob_metadata(self, connection_string: str):
        """Yield blob names and last-modified values using list operations only."""
        client = self._client(connection_string)
        if isinstance(client, ContainerClient):
            for blob in client.list_blobs(timeout=15):
                yield {"name": blob.name, "last_modified": blob.last_modified}
            return
        for container in client.list_containers(timeout=15):
            container_client = client.get_container_client(container.name)
            for blob in container_client.list_blobs(timeout=15):
                yield {
                    "container": container.name,
                    "name": blob.name,
                    "last_modified": blob.last_modified,
                }
